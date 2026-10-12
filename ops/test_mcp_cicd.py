import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from mcp_cicd import Deployer, MIGRATION_TIMEOUT_SECONDS, WORKFLOW_ID, successful_ci


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
        self.deployer.still_latest = Mock(return_value=True)
        self.deployer.approved_ci = Mock(return_value={"id": 1, "html_url": "ci"})

    def migration_release(self):
        release = self.deployer.releases / SHA
        sql = release / "prisma" / "migrations" / "0001_baseline" / "migration.sql"
        sql.parent.mkdir(parents=True)
        sql.write_text("CREATE TABLE products (id text PRIMARY KEY);\n")
        (release / "prisma" / "schema.prisma").write_text("// Prisma fixture\n")
        cli = release / "node_modules" / "prisma" / "build" / "index.js"
        cli.parent.mkdir(parents=True)
        cli.write_text("// CLI fixture\n")
        self.deployer.env["DATABASE_URL"] = "postgresql://user:secret%21@db/staging"
        return release

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

    def test_unapproved_release_cannot_change_database(self):
        self.deployer.prepare_release = Mock(return_value=Path("release"))
        self.deployer.migrate_release = Mock()
        self.deployer.check_candidate = Mock()
        self.deployer.activate = Mock()
        for latest, run in [(False, {"id": 1}), (True, None)]:
            with self.subTest(latest=latest, run=run):
                self.deployer.still_latest.return_value = latest
                self.deployer.approved_ci.return_value = run
                self.assertFalse(self.deployer.deploy_revision(SHA, {}))
        self.deployer.migrate_release.assert_not_called()
        self.deployer.check_candidate.assert_not_called()
        self.deployer.activate.assert_not_called()

    def test_release_superseded_after_migration_is_not_activated(self):
        self.deployer.prepare_release = Mock(return_value=Path("release"))
        self.deployer.migrate_release = Mock()
        self.deployer.check_candidate = Mock()
        self.deployer.still_latest.side_effect = [True, False]
        self.deployer.activate = Mock()
        self.assertFalse(self.deployer.deploy_revision(SHA, {}))
        self.deployer.activate.assert_not_called()

    def test_ci_failure_after_migration_is_not_activated(self):
        self.deployer.prepare_release = Mock(return_value=Path("release"))
        self.deployer.migrate_release = Mock()
        self.deployer.check_candidate = Mock()
        self.deployer.approved_ci.side_effect = [{"id": 1}, None]
        self.deployer.activate = Mock()
        self.assertFalse(self.deployer.deploy_revision(SHA, {}))
        self.deployer.activate.assert_not_called()

    @patch("mcp_cicd.stop_process")
    @patch("mcp_cicd.subprocess.Popen")
    def test_cached_build_still_migrates_and_preserves_environment(self, popen, stop):
        release = self.migration_release()
        (release / ".ready").write_text(SHA)
        self.deployer.check_candidate = Mock()
        self.deployer.activate = Mock()
        popen.return_value.wait.return_value = 0
        for database in ["staging", "production"]:
            with self.subTest(database=database):
                self.deployer.env["DATABASE_URL"] = f"postgresql://user:secret@db/{database}"
                self.assertTrue(self.deployer.deploy_revision(SHA, {}))
                self.assertEqual(popen.call_args.kwargs["env"]["DATABASE_URL"],
                                 self.deployer.env["DATABASE_URL"])
                self.assertEqual(popen.call_args.kwargs["cwd"], release)
                self.assertEqual(popen.call_args.args[0][-2:], ["migrate", "deploy"])
        self.assertEqual(popen.call_count, 2)

    @patch("mcp_cicd.stop_process")
    @patch("mcp_cicd.subprocess.Popen")
    def test_migration_failures_keep_server_and_saved_state_then_allow_retry(self, popen, stop):
        release = self.migration_release()
        previous = {"sha": OLD_SHA, "ci_run_id": 1, "status": "running"}
        self.deployer.current = previous
        self.deployer.write_state(previous)
        server = self.deployer.server = Mock()
        self.deployer.prepare_release = Mock(return_value=release)
        self.deployer.check_candidate = Mock()
        self.deployer.activate = Mock()

        def cli_output(*args, **kwargs):
            kwargs["stdout"].write("Cannot connect: " + self.deployer.env["DATABASE_URL"] +
                                     " password secret%21 decoded secret!\n")
            return process

        process = Mock()
        popen.side_effect = cli_output
        for failure in [1, subprocess.TimeoutExpired("migration", MIGRATION_TIMEOUT_SECONDS)]:
            with self.subTest(failure=failure):
                process.wait.side_effect = failure if isinstance(failure, Exception) else None
                process.wait.return_value = failure if isinstance(failure, int) else None
                with self.assertRaises(RuntimeError) as error:
                    self.deployer.deploy_revision(SHA, {})
                self.assertNotIn("secret", str(error.exception))
                self.assertIs(self.deployer.server, server)
                self.assertEqual(self.deployer.current, previous)
                self.assertEqual(self.deployer.read_state()["sha"], OLD_SHA)
                self.assertIsNone(self.deployer.migration_process)
                self.deployer.check_candidate.assert_not_called()
                self.deployer.activate.assert_not_called()
                self.assertNotIn(server, [call.args[0] for call in stop.call_args_list])
        log = (self.deployer.logs / f"migration-{SHA}.log").read_text()
        self.assertNotIn("secret", log)
        self.assertNotIn("postgresql://", log)
        self.assertEqual((self.deployer.logs / f"migration-{SHA}.log").stat().st_mode & 0o777, 0o600)
        process.wait.side_effect = None
        process.wait.return_value = 0
        self.assertTrue(self.deployer.deploy_revision(SHA, {}))
        self.deployer.check_candidate.assert_called_once_with(release)
        self.deployer.activate.assert_called_once()

    @patch("mcp_cicd.subprocess.Popen")
    def test_prisma_release_fails_closed_without_database_url_or_cli(self, popen):
        release = self.migration_release()
        del self.deployer.env["DATABASE_URL"]
        with self.assertRaisesRegex(RuntimeError, "DATABASE_URL"):
            self.deployer.migrate_release(release)
        self.deployer.env["DATABASE_URL"] = "postgresql://user:secret@db/staging"
        (release / "node_modules" / "prisma" / "build" / "index.js").unlink()
        with self.assertRaisesRegex(RuntimeError, "CLI is missing"):
            self.deployer.migrate_release(release)
        popen.assert_not_called()

    @patch("mcp_cicd.subprocess.Popen")
    def test_prisma_schema_without_migrations_is_rejected_but_legacy_release_is_allowed(self, popen):
        release = self.deployer.releases / SHA
        self.deployer.migrate_release(release)
        schema = release / "prisma" / "schema.prisma"
        schema.parent.mkdir(parents=True)
        schema.write_text("// Prisma fixture\n")
        with self.assertRaisesRegex(RuntimeError, "no migration SQL"):
            self.deployer.migrate_release(release)
        popen.assert_not_called()

    @patch("mcp_cicd.stop_process")
    def test_saved_release_restore_migrates_before_stopping_or_starting_server(self, stop):
        release = self.migration_release()
        previous = {"sha": OLD_SHA, "ci_run_id": 1}
        self.deployer.current = previous
        self.deployer.server = Mock()
        self.deployer.migrate_release = Mock(side_effect=RuntimeError("DB unavailable"))
        self.deployer.start_server = Mock()
        with self.assertRaisesRegex(RuntimeError, "DB unavailable"):
            self.deployer.activate({"sha": SHA, "ci_run_id": 2})
        self.deployer.migrate_release.assert_called_once_with(release)
        self.deployer.start_server.assert_not_called()
        stop.assert_not_called()
        self.assertEqual(self.deployer.current, previous)

    @patch("mcp_cicd.time.sleep")
    @patch("mcp_cicd.time.monotonic", side_effect=[0, 0, 46])
    @patch("mcp_cicd.urlopen")
    def test_http_200_home_cannot_hide_catalog_database_failure(self, urlopen, monotonic, sleep):
        release = self.migration_release()
        route = release / "app" / "api" / "catalog" / "route.ts"
        route.parent.mkdir(parents=True)
        route.write_text("// Catalog route fixture\n")
        home, catalog = Mock(), Mock()
        home.status, catalog.status = 200, 503
        home.__enter__ = Mock(return_value=home)
        home.__exit__ = Mock(return_value=False)
        catalog.__enter__ = Mock(return_value=catalog)
        catalog.__exit__ = Mock(return_value=False)
        urlopen.side_effect = [home, catalog]
        process = Mock()
        process.poll.return_value = None
        with self.assertRaisesRegex(RuntimeError, "HTTP/database health check timed out"):
            self.deployer.wait_healthy(process, 3100, release)
        self.assertEqual([call.args[0] for call in urlopen.call_args_list],
                         ["http://127.0.0.1:3100/", "http://127.0.0.1:3100/api/catalog"])

    @patch("mcp_cicd.time.sleep")
    @patch("mcp_cicd.time.monotonic", side_effect=[0, 0, 46])
    @patch("mcp_cicd.urlopen")
    def test_catalog_response_must_be_valid_non_error_json(self, urlopen, monotonic, sleep):
        release = self.migration_release()
        route = release / "app" / "api" / "catalog" / "route.ts"
        route.parent.mkdir(parents=True)
        route.write_text("// Catalog route fixture\n")
        process = Mock()
        process.poll.return_value = None
        for body in [b"not JSON", b'{"error":"database unavailable"}', b'[]']:
            with self.subTest(body=body):
                response = Mock(status=200)
                response.__enter__ = Mock(return_value=response)
                response.__exit__ = Mock(return_value=False)
                response.read.return_value = body
                urlopen.return_value = response
                monotonic.side_effect = [0, 0, 46]
                with self.assertRaisesRegex(RuntimeError, "HTTP/database health check timed out"):
                    self.deployer.wait_healthy(process, 3100, release)

    @patch("mcp_cicd.time.monotonic", side_effect=[0, 0])
    @patch("mcp_cicd.urlopen")
    def test_healthy_catalog_and_legacy_home_are_accepted(self, urlopen, monotonic):
        release = self.deployer.releases / SHA
        response = Mock(status=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"revision":1,"products":[]}'
        urlopen.return_value = response
        process = Mock()
        process.poll.return_value = None
        self.deployer.wait_healthy(process, 3100, release)
        self.assertEqual(urlopen.call_count, 1)
        route = release / "app" / "api" / "catalog" / "route.ts"
        route.parent.mkdir(parents=True)
        route.write_text("// Catalog route fixture\n")
        monotonic.side_effect = [0, 0]
        urlopen.reset_mock()
        self.deployer.wait_healthy(process, 3100, release)
        self.assertEqual(urlopen.call_count, 2)

    @patch("mcp_cicd.stop_process")
    def test_shutdown_stops_active_migration(self, stop):
        process = self.deployer.migration_process = Mock()
        self.deployer.close()
        stop.assert_any_call(process)

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
