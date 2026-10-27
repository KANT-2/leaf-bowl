"""UC-D QA 도구 자체 검사. 원격 서버/DB 접근 및 파일 변경 없음."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

MOD = Path(__file__).with_name('uc_d_final_check.py')
spec = importlib.util.spec_from_file_location('uc_d_final_check', MOD)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class SafetyTest(unittest.TestCase):
    def test_local_test_url_allowed(self):
        self.assertEqual(qa.parse_local_test_db('postgresql+asyncpg://u:p@127.0.0.1:5432/leaf_bowl_test'), ('loopback',5432,'leaf_bowl_test','u'))

    def test_shared_supabase_rejected(self):
        with self.assertRaises(qa.CheckFailure):
            qa.parse_local_test_db('postgresql://postgres:pw@db.example.supabase.co:5432/postgres')

    def test_local_non_test_db_rejected(self):
        with self.assertRaises(qa.CheckFailure):
            qa.parse_local_test_db('postgresql://u:p@localhost:5432/leaf_bowl')

    def test_dotenv_parser(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Path(directory)/'.env'
            f.write_text('# hi\nDATABASE_URL="postgresql://foo:bar@localhost:5432/leaf_bowl_test"\n')
            self.assertEqual(qa.env_value(f,'DATABASE_URL'), 'postgresql://foo:bar@localhost:5432/leaf_bowl_test')

    def test_write_requires_two_local_config_files(self):
        with tempfile.TemporaryDirectory() as directory:
            f1,f2=Path(directory)/'root.env',Path(directory)/'backend.env'
            f1.write_text('DATABASE_URL=postgresql://u:p@127.0.0.1:5432/leaf_bowl_test\n')
            f2.write_text('DATABASE_URL=postgresql://u:p@db.example.supabase.co:5432/postgres\n')
            with patch.object(qa,'NEXT_ENV',f1),patch.object(qa,'BACKEND_ENV',f2):
                with self.assertRaises(qa.CheckFailure):
                    qa.require_write_safety('http://127.0.0.1:8000',confirm=False)

    def test_different_db_ports_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            f1, f2 = Path(directory) / 'root.env', Path(directory) / 'backend.env'
            f1.write_text('DATABASE_URL=postgresql://u:p@127.0.0.1:5432/leaf_bowl_test\n')
            f2.write_text('DATABASE_URL=postgresql://u:p@localhost:6543/leaf_bowl_test\n')
            with patch.object(qa, 'NEXT_ENV', f1), patch.object(qa, 'BACKEND_ENV', f2):
                with self.assertRaises(qa.CheckFailure):
                    qa.require_write_safety('http://127.0.0.1:8000', confirm=False)

    def test_remote_auth_target_rejected(self):
        with self.assertRaises(qa.CheckFailure):
            qa.validate_base_url('https://example.com:8000')
        with self.assertRaises(qa.CheckFailure):
            qa.validate_base_url('http://127.0.0.1:8000@evil.example')

    def test_read_smoke_calls_no_patch(self):
        order_id = '123e4567-e89b-12d3-a456-426614174000'
        called = []
        spec = {'paths': {path: {verb: {}} for verb, path in qa.EXPECTED_PATHS}}
        def fake_request(base, method, path, *, token=None, data=None, form=None):
            called.append((method, path))
            if path == '/health/db':
                return 200, {'status':'ok'}
            if path == '/openapi.json':
                return 200, spec
            if path.startswith('/api/admin/orders') and not token:
                return 401, {}
            if path == '/api/admin/token':
                return 200, {'access_token':'test-jwt-not-saved'}
            if path == '/api/admin/orders?limit=50':
                return 200, {'items':[{'id':order_id}], 'nextCursor':None}
            if path == f'/api/admin/orders/{order_id}':
                return 200, {'id':order_id,'status':'received','version':1,'history':[]}
            if path.startswith('/api/admin/orders/') and 'not-a-uuid' in path:
                return 422, {}
            if path.startswith('/api/admin/orders/'):
                return 404, {}
            raise AssertionError((method, path))
        args = SimpleNamespace(base_url='http://127.0.0.1:8000', mode='read', login_id='admin',order_id=None,report=None)
        with patch.object(qa,'request_json',side_effect=fake_request), patch.object(qa.getpass,'getpass',return_value='dummy'):
            self.assertEqual(qa.run(args),0)
        self.assertTrue(any(path.endswith('/'+order_id) for _,path in called))
        self.assertFalse(any(method == 'PATCH' for method,_ in called))
        self.assertFalse(any('/logout' in path for _,path in called))

    def test_no_public_or_remote_write(self):
        with self.assertRaises(qa.CheckFailure):
            qa.require_write_safety('https://api.example.com',confirm=False)


if __name__ == '__main__':
    unittest.main()
