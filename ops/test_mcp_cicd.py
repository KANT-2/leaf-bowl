import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from mcp_cicd import Deployer, WORKFLOW_ID, successful_ci


SHA = "a" * 40
OLD_SHA = "b" * 40


def ci_run(**changes):
    return {"id": 1, "workflow_id": WORKFLOW_ID, "head_branch": "main", "head_sha": SHA,
            "event": "push", "status": "completed", "conclusion": "success", **changes}


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.deployer = Deployer(Path(self.directory.name), "main", 3100)

    @patch.dict("os.environ", {"TZ": "America/Los_Angeles"})
    def test_server_environment_and_operational_timestamps_are_utc(self):
        deployer = Deployer(Path(self.directory.name), "main", 3100)
        self.assertEqual(deployer.env["TZ"], "UTC")
        deployer.write_state({"sha": SHA})
        stored = json.loads(deployer.state_file.read_text())
        self.assertRegex(stored["updated_at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        with patch("builtins.print") as output:
            deployer.log("ready")
        self.assertTrue(re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z ", output.call_args.args[0]))

    def test_only_successful_exact_branch_push_ci_can_deploy(self):
        self.assertIsNotNone(successful_ci([ci_run()], "main", SHA))
        for changes in [{"event": "pull_request"}, {"head_branch": "production"},
                        {"head_sha": OLD_SHA}, {"workflow_id": 0},
                        {"status": "in_progress"}, {"conclusion": "failure"}]:
            self.assertIsNone(successful_ci([ci_run(**changes)], "main", SHA))

    def test_newer_failure_or_pending_run_overrides_older_success(self):
        for changes in [{"conclusion": "failure"}, {"status": "in_progress", "conclusion": None}]:
            runs = [ci_run(), ci_run(id=2, **changes)]
            self.assertIsNone(successful_ci(runs, "main", SHA))

    def test_unapproved_branch_is_rejected(self):
        with self.assertRaises(ValueError):
            Deployer(Path(self.directory.name), "feature", 3100)

    def test_build_failure_leaves_running_release_untouched(self):
        self.deployer.current = {"sha": OLD_SHA}
        self.deployer.prepare_release = Mock(side_effect=RuntimeError("build failed"))
        self.deployer.activate = Mock()
        with self.assertRaises(RuntimeError):
            self.deployer.deploy_revision(SHA, {"id": 1, "html_url": "ci"})
        self.deployer.activate.assert_not_called()
        self.assertEqual(self.deployer.current["sha"], OLD_SHA)

    def test_unhealthy_candidate_does_not_replace_running_release(self):
        self.deployer.prepare_release = Mock(return_value=Path("release"))
        self.deployer.check_candidate = Mock(side_effect=RuntimeError("HTTP failed"))
        self.deployer.activate = Mock()
        with self.assertRaises(RuntimeError):
            self.deployer.deploy_revision(SHA, {"id": 1, "html_url": "ci"})
        self.deployer.activate.assert_not_called()

    def test_superseded_commit_is_not_activated(self):
        self.deployer.prepare_release = Mock(return_value=Path("release"))
        self.deployer.check_candidate = Mock()
        self.deployer.still_latest = Mock(return_value=False)
        self.deployer.activate = Mock()
        self.assertFalse(self.deployer.deploy_revision(SHA, {"id": 1, "html_url": "ci"}))
        self.deployer.activate.assert_not_called()

    def test_ci_recheck_failure_does_not_activate_built_release(self):
        self.deployer.prepare_release = Mock(return_value=Path("release"))
        self.deployer.check_candidate = Mock()
        self.deployer.still_latest = Mock(return_value=True)
        self.deployer.approved_ci = Mock(return_value=None)
        self.deployer.activate = Mock()
        self.assertFalse(self.deployer.deploy_revision(SHA, {"id": 1, "html_url": "ci"}))
        self.deployer.activate.assert_not_called()

    @patch("mcp_cicd.stop_process")
    def test_activation_failure_restores_previous_server_and_state(self, stop):
        previous = {"sha": OLD_SHA, "ci_run_id": 1, "status": "running"}
        self.deployer.current = previous
        candidate, restored = Mock(), Mock()
        self.deployer.start_server = Mock(side_effect=[candidate, restored])
        self.deployer.wait_healthy = Mock(side_effect=[RuntimeError("startup failed"), None])
        with self.assertRaises(RuntimeError):
            self.deployer.activate({"sha": SHA, "ci_run_id": 2})
        self.assertIs(self.deployer.server, restored)
        self.assertEqual(self.deployer.read_state()["sha"], OLD_SHA)
        self.assertEqual(self.deployer.current, previous)


if __name__ == "__main__":
    unittest.main()
