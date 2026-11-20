import io
import unittest
from urllib.error import HTTPError, URLError
from unittest.mock import Mock, patch
from direct_github import GitHub

class TransportTests(unittest.TestCase):
    def redirect(self,code,location):
        return HTTPError('https://api.github.com/x',code,'redirect',{'Location':location},None)

    def hops(self,path,*responses):
        opener=Mock();opener.open.side_effect=list(responses)
        with patch('direct_github.build_opener',return_value=opener),patch.dict('os.environ',{'GITHUB_TOKEN':'synthetic-test-token'}):
            body=GitHub().get(path)
        return body,[('Authorization' in dict(c.args[0].header_items()),c.args[0].full_url) for c in opener.open.call_args_list]

    def test_artifact_redirect_does_not_forward_credentials(self):
        body,calls=self.hops('repos/example/repo/actions/artifacts/1/zip',self.redirect(302,'https://artifact.example.test/file'),io.BytesIO(b'zip'))
        self.assertEqual(body,b'zip');self.assertEqual([c[0] for c in calls],[True,False])

    def test_moved_repository_redirect_keeps_credentials_on_the_api_host(self):
        # darkhipo moved his repositories to BigO-Hunter (2026-11-20); the unauthenticated follow hit the IP limit (403).
        body,calls=self.hops('repos/old-owner/repo/commits/abc',self.redirect(301,'https://api.github.com/repositories/1/commits/abc'),io.BytesIO(b'{}'))
        self.assertEqual(body,b'{}');self.assertEqual([c[0] for c in calls],[True,True])
        for location in ('https://api.github.com.example.test/x','https://api.github.com:8443/x'):
            _,calls=self.hops('repos/old-owner/repo',self.redirect(301,location),io.BytesIO(b'{}'))
            self.assertEqual([c[0] for c in calls],[True,False])

    def test_moved_repository_artifact_drops_the_token_at_the_storage_host(self):
        # Reviewer, 2026-11-20: api.github.com 301 -> api.github.com, then 302 -> blob storage. The token stays on
        # api.github.com; the storage hop, and any hop after it, even one back to api.github.com, gets none.
        _,calls=self.hops('repos/old/x/actions/artifacts/1/zip',self.redirect(301,'https://api.github.com/repositories/1/actions/artifacts/1/zip'),
                          self.redirect(302,'https://storage.example.test/blob?sig=s'),io.BytesIO(b'zip'))
        self.assertEqual(calls,[(True,'https://api.github.com/repos/old/x/actions/artifacts/1/zip'),(True,'https://api.github.com/repositories/1/actions/artifacts/1/zip'),(False,'https://storage.example.test/blob?sig=s')])
        _,calls=self.hops('repos/old/x',self.redirect(302,'https://storage.example.test/a'),self.redirect(302,'https://api.github.com/y'),io.BytesIO(b'{}'))
        self.assertEqual([c[0] for c in calls],[True,False,False])

    def test_redirects_are_bounded(self):
        with self.assertRaises(ValueError):self.hops('repos/example/repo',*[self.redirect(301,'https://api.github.com/r')]*4)

    def test_connection_retries_are_bounded(self):
        opener=Mock();opener.open.side_effect=URLError('offline')
        with patch('direct_github.build_opener',return_value=opener),patch('direct_github.time.sleep') as sleep:
            with self.assertRaises(RuntimeError):GitHub().get('repos/example/repo')
        self.assertEqual(opener.open.call_count,3)
        self.assertEqual([x.args[0] for x in sleep.call_args_list],[2,4])

    def test_oversized_response_and_insecure_redirect_rejected(self):
        opener=Mock();opener.open.return_value=io.BytesIO(b'oversized')
        with patch('direct_github.build_opener',return_value=opener):
            with self.assertRaises(ValueError):GitHub().get('repos/example/repo',limit=2)
        opener.open.side_effect=HTTPError('https://api.github.com/x',302,'redirect',{'Location':'http://artifact.example.test/file'},None)
        with patch('direct_github.build_opener',return_value=opener):
            with self.assertRaises(ValueError):GitHub().get('repos/example/repo')
