import json,subprocess,tempfile,unittest
from pathlib import Path
from refresh import git_state_dir
ROOT=Path(__file__).resolve().parent
class ExportTests(unittest.TestCase):
    def test_export_preserves_claims_and_refuses_existing_directory(self):
        with tempfile.TemporaryDirectory(dir=git_state_dir()) as tmp:
            target=Path(tmp)/'bundle'
            result=subprocess.run(['python3',str(ROOT/'build_data.py'),'--output',str(target)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            registry=json.loads((ROOT/'registry.json').read_text())
            for p in registry['problems']:
                self.assertEqual((ROOT/p['data_file']).read_bytes(),(target/p['data_file']).read_bytes())
            again=subprocess.run(['python3',str(ROOT/'build_data.py'),'--output',str(target)],capture_output=True,text=True)
            self.assertNotEqual(again.returncode,0)
if __name__=='__main__':unittest.main()
