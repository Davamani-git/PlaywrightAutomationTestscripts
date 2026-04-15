import unittest
from selenium import webdriver
from Pages.BridgeNowFinanceLandingPage import BridgeNowFinanceLandingPage
from Pages.ApplicationFormPage import ApplicationFormPage

class TestBridgeNowFinanceLandingPage(unittest.TestCase):
    def setUp(self):
        self.driver = webdriver.Chrome()
        self.driver.get('https://your-application-url.com')  # Replace with actual URL

    def tearDown(self):
        self.driver.quit()

    def test_cta_visibility(self):
        """
        VRVTEMP-390 TS-003 TC-001
        Steps:
        1. Launch the application or navigate to the website.
        2. Navigate to the BridgeNow Finance landing page.
        3. Review the page layout and content.
        4. Locate the call-to-action (CTA) to apply.
        Expected: A clear and prominent CTA to apply is visible on the landing page.
        """
        landing_page = BridgeNowFinanceLandingPage(self.driver)
        self.assertTrue(landing_page.is_loaded(), "Landing page did not load correctly.")
        self.assertTrue(landing_page.is_cta_visible(), "CTA to apply is not visible.")

    def test_apply_and_submit_application(self):
        """
        VRVTEMP-390 TS-004 TC-001
        Steps:
        1. Launch the application or navigate to the website.
        2. Navigate to the BridgeNow Finance landing page.
        3. Click on the 'Apply' CTA.
        4. Fill in the application form with eligible customer details.
        5. Submit the application.
        6. Observe the processing workflow.
        Expected: The application is processed automatically via the STP workflow without manual intervention.
        """
        landing_page = BridgeNowFinanceLandingPage(self.driver)
        self.assertTrue(landing_page.is_loaded(), "Landing page did not load correctly.")
        landing_page.click_apply_cta()
        form_page = ApplicationFormPage(self.driver)
        form_page.fill_application_form(name="John Doe", email="john.doe@example.com", phone="1234567890")
        form_page.submit_application()
        self.assertTrue(form_page.is_processing_workflow_displayed(), "Processing workflow is not displayed.")

if __name__ == "__main__":
    unittest.main()
