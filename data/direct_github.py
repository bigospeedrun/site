"""Bounded GitHub GET transport for public submission metadata and artifacts."""
import json
import os
import time
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

class GitHubError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f'GitHub GET failed (HTTP {status})')

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

class GitHub:
    def json(self, path, params=None):
        if params:
            path += '?' + urlencode(params)
        return json.loads(self.get(path, 16_000_000))

    def _follow(self, url, headers):
        """Open url and follow at most 3 redirects, one hop at a time. Every hop must be https with no userinfo.
        The request headers (the token) go only to https://api.github.com with no port, and only while every hop so
        far stayed there: a moved or renamed repository redirects to api.github.com itself, and without the token
        that call hits the 60/h IP limit (403; darkhipo -> BigO-Hunter, 2026-11-20). Once a hop leaves for another
        host (an artifact download), every later hop gets only the User-Agent."""
        trusted=True
        for hop in range(4):
            try:
                return build_opener(NoRedirect).open(Request(url,headers=headers if trusted else {'User-Agent':headers['User-Agent']}),timeout=90)
            except HTTPError as error:
                if error.code not in (301,302,303,307,308):
                    raise
                if hop==3:
                    raise ValueError('Too many GitHub redirects') from None
                url=urljoin(url,error.headers['Location']); parts=urlsplit(url)
                if parts.scheme!='https' or parts.username or parts.password:
                    raise ValueError('Unsafe artifact redirect') from None
                trusted=trusted and parts.hostname=='api.github.com' and parts.port is None

    def get(self, path, limit=128_000_000):
        if path.startswith('/') or '://' in path:
            raise ValueError('Expected GitHub API relative path')
        headers={'Accept':'application/vnd.github+json','User-Agent':'bigospeedrun-direct-import','X-GitHub-Api-Version':'2022-11-28'}
        if os.environ.get('GITHUB_TOKEN'):
            headers['Authorization']='Bearer '+os.environ['GITHUB_TOKEN']
        for attempt in range(3):
            try:
                response=self._follow('https://api.github.com/'+path,headers)
                with response:
                    raw=response.read(limit+1)
                if len(raw)>limit:
                    raise ValueError('GitHub response exceeds limit')
                return raw
            except HTTPError as error:
                if error.code not in (429,500,502,503,504) or attempt==2:
                    raise GitHubError(error.code) from None
                delay=20 if error.code==429 else 2**(attempt+1)
            except (URLError,ConnectionError,TimeoutError,HTTPException):
                if attempt==2:
                    raise RuntimeError('GitHub GET connection failed') from None
                delay=2**(attempt+1)
            time.sleep(delay)

    def pages(self,path,params=None,key=None):
        rows=[]
        for page in range(1,31):
            obj=self.json(path,{**(params or {}),'per_page':100,'page':page})
            batch=obj[key] if key else obj
            rows.extend(batch)
            if len(batch)<100:
                return rows
        raise ValueError('Pagination incomplete; preserve previous data')
