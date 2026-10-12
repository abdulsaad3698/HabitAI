import os
import tempfile
import unittest
import io
import json
from pathlib import Path
from unittest.mock import patch

_test_directory = tempfile.TemporaryDirectory()
os.environ["DATABASE_PATH"] = str(Path(_test_directory.name) / "habits.sqlite3")

import app as habit_app


class HabitWebsiteTests(unittest.TestCase):
    def setUp(self):
        habit_app.app.config.update(TESTING=True)
        self.client = habit_app.app.test_client()
        with habit_app.get_db() as connection:
            connection.execute("DELETE FROM completions")
            connection.execute("DELETE FROM habits")

    def test_homepage_loads(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Your habits", response.data)

    def test_habit_can_be_created_completed_and_deleted(self):
        created = self.client.post("/api/habits", json={"name": "Walk"})
        self.assertEqual(created.status_code, 201)
        habit = created.get_json()
        self.assertEqual(habit["name"], "Walk")
        self.assertFalse(habit["completedToday"])

        completed = self.client.post(f"/api/habits/{habit['id']}/toggle")
        self.assertTrue(completed.get_json()["completedToday"])
        listed = self.client.get("/api/habits").get_json()
        self.assertTrue(listed[0]["completedToday"])
        self.assertEqual(listed[0]["streak"], 1)

        self.client.delete(f"/api/habits/{habit['id']}")
        self.assertEqual(self.client.get("/api/habits").get_json(), [])

    def test_habit_name_is_validated(self):
        self.assertEqual(
            self.client.post("/api/habits", json={"name": "  "}).status_code,
            400,
        )
        self.assertEqual(
            self.client.post("/api/habits", json={"name": "x" * 81}).status_code,
            400,
        )

    def test_bulk_habits_are_created_together(self):
        response = self.client.post(
            "/api/habits/bulk",
            json={"names": ["Walk", "Read", "Stretch"]},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            [habit["name"] for habit in response.get_json()["habits"]],
            ["Walk", "Read", "Stretch"],
        )
        self.assertEqual(
            [habit["name"] for habit in self.client.get("/api/habits").get_json()],
            ["Stretch", "Read", "Walk"],
        )

    def test_bulk_habits_reject_invalid_names_without_creating_any(self):
        response = self.client.post(
            "/api/habits/bulk",
            json={"names": ["Walk", " "]},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/habits").get_json(), [])

    def test_habit_and_ai_plan_reject_non_object_json(self):
        habit_response = self.client.post("/api/habits", json=["Walk"])
        plan_response = self.client.post("/api/ai/plan", json=["sleep better"])

        self.assertEqual(habit_response.status_code, 400)
        self.assertEqual(plan_response.status_code, 400)

    @patch.object(habit_app, "generate_with_gemini", return_value='["Walk", "Read", "Stretch"]')
    def test_ai_plan_returns_three_suggestions(self, _generate):
        response = self.client.post("/api/ai/plan", json={"goal": "feel healthier"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["habits"], ["Walk", "Read", "Stretch"])

    @patch.object(
        habit_app,
        "generate_with_gemini",
        return_value="You have made a good start. Keep your next step small.",
    )
    def test_ai_coach_returns_personalized_checkin(self, _generate):
        self.client.post("/api/habits", json={"name": "Walk"})
        response = self.client.post("/api/ai/coach")
        self.assertEqual(response.status_code, 200)
        self.assertIn("good start", response.get_json()["coaching"])

    def test_ai_coach_explains_when_there_are_no_habits(self):
        response = self.client.post("/api/ai/coach")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Add at least one habit", response.get_json()["error"])

    @patch.object(
        habit_app,
        "generate_with_gemini",
        side_effect=RuntimeError(
            "Gemini is not configured. Add your GEMINI_API_KEY to a .env file."
        ),
    )
    def test_ai_plan_surfaces_missing_configuration(self, _generate):
        response = self.client.post("/api/ai/plan", json={"goal": "sleep better"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("GEMINI_API_KEY", response.get_json()["error"])

    def test_ai_plan_does_not_send_placeholder_key_to_gemini(self):
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "replace-with-your-gemini-api-key"},
        ):
            response = self.client.post(
                "/api/ai/plan",
                json={"goal": "sleep better"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json()["error"],
            "Gemini is not configured. Add your GEMINI_API_KEY to a .env file.",
        )

    @patch.object(
        habit_app,
        "generate_image_insight_with_gemini",
        return_value=json.dumps(
            {
                "image_summary": "A person is reading a book.",
                "possible_habit": "Daily reading.",
                "why_it_matters": "Reading can support learning and focus.",
                "tiny_first_step": "Read one page today.",
            }
        ),
    )
    def test_image_insight_sends_valid_image_and_returns_importance(self, generate):
        response = self.client.post(
            "/api/ai/image-insight",
            data={
                "image": (io.BytesIO(b"\x89PNG\r\n\x1a\nimage-bytes"), "photo.png"),
                "context": "I want to read more.",
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["why_it_matters"],
            "Reading can support learning and focus.",
        )
        self.assertEqual(generate.call_args.args[2], "image/png")

    def test_image_insight_rejects_non_image_upload(self):
        response = self.client.post(
            "/api/ai/image-insight",
            data={"image": (io.BytesIO(b"not an image"), "photo.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("valid PNG", response.get_json()["error"])

    def test_image_insight_explains_temporary_gemini_overload(self):
        class GeminiBusyError(Exception):
            code = 503

        with patch.object(
            habit_app,
            "generate_image_insight_with_gemini",
            side_effect=GeminiBusyError("provider details"),
        ):
            response = self.client.post(
                "/api/ai/image-insight",
                data={
                    "image": (io.BytesIO(b"\x89PNG\r\n\x1a\nimage-bytes"), "photo.png"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json()["error"],
            "Gemini is busy right now. Please wait a moment and try again.",
        )

    def test_image_insight_rejects_oversized_upload(self):
        response = self.client.post(
            "/api/ai/image-insight",
            data={
                "image": (
                    io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"x" * habit_app.MAX_IMAGE_BYTES),
                    "large.png",
                )
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 413)
        self.assertIn("5 MB", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
