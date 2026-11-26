import unittest
from unittest.mock import MagicMock, patch

from cloud_uploader import upload_reading


class CloudUploaderTest(unittest.TestCase):
    def test_rejects_insecure_urls_before_sending_credentials(self):
        for url in ['http://fridge.example', 'https://user:password@fridge.example', 'not-a-url']:
            with self.assertRaises(ValueError):
                upload_reading(url, 'test-token', 4.0)

    @patch('cloud_uploader.urllib.request.build_opener')
    def test_sends_reading_to_fixed_endpoint_with_private_header(self, build):
        response = MagicMock()
        response.__enter__.return_value.status = 201
        build.return_value.open.return_value = response
        upload_reading('https://fridge.example/fridge', 'test-token', 4.0)
        request = build.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, 'https://fridge.example/api/readings')
        self.assertEqual(request.get_header('Oai-sites-authorization'), 'Bearer test-token')
        self.assertEqual(request.data, b'{"temperature_c": 4.0}')
        handler = build.call_args.args[0]
        self.assertIsNone(handler.redirect_request(None, None, 302, '', {}, 'https://other.example'))

    @patch('cloud_uploader.urllib.request.build_opener')
    def test_vercel_uses_separate_device_authorization(self, build):
        response = MagicMock()
        response.__enter__.return_value.status = 201
        build.return_value.open.return_value = response
        upload_reading('https://fridge.example', 'device-test-token', 4.0, device_token=True)
        request = build.return_value.open.call_args.args[0]
        self.assertEqual(request.get_header('Authorization'), 'Bearer device-test-token')
        self.assertIsNone(request.get_header('Oai-sites-authorization'))
