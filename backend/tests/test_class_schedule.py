import unittest

from app.services.class_schedule import class_date_error, class_term_error, format_class_dates


class TestClassSchedule(unittest.TestCase):
    def test_unassigned_dates_are_allowed(self):
        self.assertIsNone(class_date_error(None, None))
        self.assertIsNone(class_date_error("", "   "))
        self.assertEqual(format_class_dates(None, None), "Unassigned")

    def test_rejects_year_9999(self):
        self.assertEqual(
            class_date_error("9999-01-01", "9999-12-31"),
            "Class dates must fall in 2026 or 2027.",
        )

    def test_rejects_partial_and_inverted_dates(self):
        self.assertEqual(class_date_error("2026-09-07", None), "Set both a start date and an end date.")
        self.assertEqual(
            class_date_error("2026-11-28", "2026-09-07"),
            "End date must be on or after the start date.",
        )

    def test_accepts_dates_in_window(self):
        self.assertIsNone(class_date_error("2026-09-07", "2026-11-28"))
        self.assertEqual(format_class_dates("2026-09-07", "2026-11-28"), "Sep 07 – Nov 28, 2026")

    def test_terms_are_2026_and_2027_only(self):
        self.assertIsNone(class_term_error("Semester 2, 2026"))
        self.assertIsNone(class_term_error("  Semester 3, 2027  "))
        self.assertEqual(class_term_error(""), "Choose a term in 2026 or 2027.")
        self.assertEqual(class_term_error("semester 1, 2026"), "Choose a term in 2026 or 2027.")
        self.assertEqual(class_term_error("Semester 1, 2025"), "Choose a term in 2026 or 2027.")
        self.assertEqual(class_term_error("Semester 1, 2028"), "Choose a term in 2026 or 2027.")
        self.assertIsNone(class_term_error("Semester 2, 2030", current="Semester 2, 2030"))
        self.assertEqual(
            class_term_error("Semester 1, 2025", current="Semester 2, 2030"),
            "Choose a term in 2026 or 2027.",
        )

    def test_same_day_boundary_and_cross_year_dates(self):
        self.assertIsNone(class_date_error("2026-01-01", "2026-01-01"))
        self.assertIsNone(class_date_error("  2026-09-07 ", "2027-12-31"))
        self.assertEqual(
            format_class_dates("2026-12-20", "2027-01-10"),
            "Dec 20, 2026 – Jan 10, 2027",
        )
        self.assertEqual(format_class_dates("2026-09-07", "2026-09-07"), "Sep 07 – Sep 07, 2026")

    def test_rejects_impossible_dates_and_keeps_unparsed_labels(self):
        self.assertEqual(
            class_date_error("2026-02-31", "2026-03-01"),
            "Enter a valid start date and end date.",
        )
        self.assertEqual(format_class_dates("not-a-date", "also-bad"), "not-a-date – also-bad")
        self.assertEqual(format_class_dates("2026-09-07T00:00:00", "2026-11-28"), "Sep 07 – Nov 28, 2026")


if __name__ == "__main__":
    unittest.main()
