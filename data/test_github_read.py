"""Offline regression checks for transient GitHub GET failures."""
import base64
import hashlib
import io
import unittest
from http.client import RemoteDisconnected, IncompleteRead
from unittest.mock import patch, call
from urllib.error import HTTPError, URLError
import github_read

class GitHubReadTests(unittest.TestCase):
    def test_connection_and_server_failures_retry_with_backoff(self):
        failures = [RemoteDisconnected(), ConnectionResetError(), TimeoutError(),
                    URLError('offline'), IncompleteRead(b'partial')]
        failures += [HTTPError('https://api.github.com/test', code, 'error', {}, None)
                     for code in (500, 502, 503, 504, 599)]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__, code=getattr(failure,'code',None)):
                with patch.object(github_read,'urlopen',side_effect=[failure, failure, io.BytesIO(b'{"ok":true}')]) as get, patch.object(github_read.time,'sleep') as sleep:
                    self.assertEqual(github_read.api('test'), {'ok':True})
                    self.assertEqual(get.call_count,3)
                    self.assertEqual(sleep.call_args_list,[call(2),call(4)])
                    self.assertTrue(all(c.args[0].get_method()=='GET' for c in get.call_args_list))

    def test_rate_limit_uses_retry_after_or_twenty_seconds(self):
        cases=[({},20), ({'Retry-After':'45'},45),
               ({'Retry-After':'Thu, 01 Jan 1970 00:02:00 GMT'},60),
               ({'Retry-After':'invalid'},20), ({'Retry-After':'0'},0)]
        for headers,delay in cases:
            with self.subTest(headers=headers):
                error=HTTPError('test',429,'rate limit',headers,None)
                with patch.object(github_read,'urlopen',side_effect=[error,error,io.BytesIO(b'{}')]) as get, patch.object(github_read.time,'sleep') as sleep, patch.object(github_read.time,'time',return_value=60):
                    self.assertEqual(github_read.api('test'),{})
                    self.assertEqual(get.call_count,3)
                    self.assertEqual(sleep.call_args_list,[call(delay),call(delay)])

    def test_exhaustion_is_bounded_and_hides_error_details(self):
        with patch.object(github_read,'urlopen',side_effect=RemoteDisconnected('private diagnostic')) as get, patch.object(github_read.time,'sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError,r'^GitHub GET failed: test \(connection error after 3 attempts\)$'):
                github_read.api('test',{'q':'private query'})
            self.assertEqual(get.call_count,3)
            self.assertEqual(sleep.call_count,2)

    def test_permanent_http_errors_do_not_retry(self):
        for code in (401,403,404):
            with patch.object(github_read,'urlopen',side_effect=HTTPError('test',code,'private diagnostic',{},None)) as get, patch.object(github_read.time,'sleep') as sleep:
                with self.assertRaisesRegex(RuntimeError,f'HTTP {code}'):
                    github_read.api('test')
                self.assertEqual(get.call_count,1)
                sleep.assert_not_called()

    def large_file(self, raw, blob_sha=None, size=None, blob_raw=None):
        """Contents API answer for a file over 1 MB, then its git blob."""
        sha=hashlib.sha1(b'blob %d\0'%len(raw)+raw).hexdigest()
        blob_sha=sha if blob_sha is None else blob_sha
        listing={'type':'file','encoding':'none','content':'','sha':blob_sha,'size':len(raw) if size is None else size}
        blob={'sha':blob_sha,'encoding':'base64','content':base64.encodebytes(raw if blob_raw is None else blob_raw).decode()}
        return [listing,blob]

    def test_large_file_reads_the_hash_checked_git_blob(self):
        raw=b'{"endpoint":{"kappa":"3001053/1000000000"}}'+b' '*1_421_000
        with patch.object(github_read,'api',side_effect=self.large_file(raw)) as get:
            self.assertEqual(github_read.content('o/r','research/x/RESULT.json','c'*40),raw)
        sha=hashlib.sha1(b'blob %d\0'%len(raw)+raw).hexdigest()
        self.assertEqual([c.args[0] for c in get.call_args_list],['repos/o/r/contents/research/x/RESULT.json',f'repos/o/r/git/blobs/{sha}'])

    def test_large_file_rejects_a_bad_blob(self):
        raw=b'{"kappa":"1/2"}'
        cases={'hash':self.large_file(raw,blob_raw=b'{"kappa":"1/3"}'),
               'size':self.large_file(raw,size=len(raw)+1),
               'no sha':self.large_file(raw,blob_sha='../../x'),
               'cap':self.large_file(raw,size=github_read.MAX_BLOB_BYTES+1)}
        for name,answers in cases.items():
            with self.subTest(name), patch.object(github_read,'api',side_effect=answers) as get:
                with self.assertRaises(ValueError):
                    github_read.content('o/r','RESULT.json','c'*40)
                self.assertEqual(get.call_count,2 if name in ('hash','size') else 1)

    def test_a_caller_can_raise_the_size_cap_for_one_read(self):
        raw=b'x'*10
        size=github_read.MAX_BLOB_BYTES+1
        with patch.object(github_read,'api',side_effect=self.large_file(raw,size=size)):
            with self.assertRaises(ValueError): github_read.content('o/r','big.json','c'*40)
        with patch.object(github_read,'api',side_effect=self.large_file(raw,size=size)):
            with self.assertRaises(ValueError) as caught: github_read.content('o/r','big.json','c'*40,max_bytes=size)  # past the cap: the size check passes, the size/hash check fails
        self.assertNotIn('too large',str(caught.exception))

if __name__=='__main__':unittest.main()
