import io
import unittest
from urllib.error import HTTPError, URLError
from unittest.mock import Mock, patch
from direct_github import GitHub

class TransportTests(unittest.TestCase):
    def test_artifact_redirect_does_not_forward_credentials(self):
        opener=Mock();opener.open.side_effect=HTTPError('https://api.github.com/x',302,'redirect',{'Location':'https://artifact.example.test/file'},None)
        with patch('direct_github.build_opener',return_value=opener),patch('direct_github.urlopen',return_value=io.BytesIO(b'zip')) as public,patch.dict('os.environ',{'GITHUB_TOKEN':'synthetic-test-token'}):
            self.assertEqual(GitHub().get('repos/example/repo/actions/artifacts/1/zip'),b'zip')
        self.assertIn('Authorization',dict(opener.open.call_args.args[0].header_items()))
        self.assertNotIn('Authorization',dict(public.call_args.args[0].header_items()))

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
