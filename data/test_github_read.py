"""Offline regression checks for transient GitHub GET failures."""
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

if __name__=='__main__':unittest.main()
