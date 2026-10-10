"""GitHub REST GET only. Uses GITHUB_TOKEN when supplied; public reads work without it."""
import base64,json,os,time
from urllib.parse import urlencode,quote
from urllib.request import Request,urlopen
from urllib.error import HTTPError, URLError
from http.client import HTTPException
from email.utils import parsedate_to_datetime

def rate_limit_wait(headers):
    value=(headers or {}).get('Retry-After','').strip()
    if value.isascii() and value.isdigit():return int(value)
    if value:
        try:return max(0,parsedate_to_datetime(value).timestamp()-time.time())
        except (ValueError, TypeError, OverflowError):pass
    return 20

def api(path,params=None):
    if params:path+=('&' if '?' in path else '?')+urlencode(params)
    headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'bigospeedrun-data'}
    if os.environ.get('GITHUB_TOKEN'):headers['Authorization']='Bearer '+os.environ['GITHUB_TOKEN']
    for attempt in range(3):
        try:
            request=Request('https://api.github.com/'+path,headers=headers,method='GET')
            with urlopen(request,timeout=120) as response:return json.load(response)
        except HTTPError as error:
            if attempt<2 and (error.code==429 or 500<=error.code<600):
                time.sleep(rate_limit_wait(error.headers) if error.code==429 else 2 ** (attempt+1));continue
            raise RuntimeError(f'GitHub GET failed: {path.split("?")[0]} (HTTP {error.code})') from None
        except (URLError, ConnectionError, TimeoutError, HTTPException):
            if attempt<2:
                time.sleep(2 ** (attempt+1));continue
            raise RuntimeError(f'GitHub GET failed: {path.split("?")[0]} (connection error after 3 attempts)') from None
    raise RuntimeError('GitHub GET retries exhausted')

def pages(path,params=None,limit=30):
    out=[]
    for page in range(1,limit+1):
        data=api(path,{**(params or {}),'per_page':100,'page':page});out.extend(data)
        if len(data)<100:return out
    raise RuntimeError('GitHub pagination limit reached')

def content(repo,path,sha):
    data=api(f'repos/{repo}/contents/{quote(path,safe="/")}',{'ref':sha})
    if data.get('encoding')!='base64':raise ValueError('Unsupported GitHub content encoding')
    return base64.b64decode(data['content'])
