"""
DevOnboard - Selenium End-to-End (E2E) Browser Test Suite
Validates DOM rendering, interactive CLI terminal, Evidence-Gated RAG UI,
Haptic sound toggles, mentor matching, and navigation in Google Chrome.

Usage:
  1. Install dependencies:
     pip install selenium

  2. Run tests headless (default):
     python3 -m unittest tests/test_selenium_e2e.py -v

  3. Run tests in visible Chrome browser:
     HEADLESS=0 python3 -m unittest tests/test_selenium_e2e.py -v
"""

import os
import sys
import time
import socket
import threading
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

from backend.app import DevOnboardHandler, init_db, seed_database, reload_rag_index
from http.server import ThreadingHTTPServer


def is_port_in_use(port: int, host: str = '127.0.0.1') -> bool:
    """Check if the test port is already occupied."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex((host, port)) == 0


@unittest.skipUnless(SELENIUM_AVAILABLE, "Selenium is not installed. Install with 'pip install selenium'")
class DevOnboardSeleniumE2E(unittest.TestCase):
    driver = None
    server_thread = None
    server_instance = None
    base_url = "http://127.0.0.1:8000"

    @classmethod
    def setUpClass(cls):
        # 1. Start background DevOnboard server if not already running on port 8000
        if not is_port_in_use(8000):
            test_port = 8000
            cls.base_url = f"http://127.0.0.1:{test_port}"
            init_db()
            seed_database()
            reload_rag_index()
            cls.server_instance = ThreadingHTTPServer(('127.0.0.1', test_port), DevOnboardHandler)
            cls.server_thread = threading.Thread(target=cls.server_instance.serve_forever, daemon=True)
            cls.server_thread.start()
            time.sleep(1.0)
        else:
            cls.base_url = "http://127.0.0.1:8000"

        # 2. Configure Chrome WebDriver Options
        chrome_options = Options()
        is_headless = os.environ.get("HEADLESS", "1").lower() not in ("0", "false", "no")
        if is_headless:
            chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--window-size=1400,900")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--mute-audio")

        cls.driver = webdriver.Chrome(options=chrome_options)
        cls.driver.implicitly_wait(6)

        # Navigate and authenticate once for all tests in class
        cls.driver.get(cls.base_url)
        WebDriverWait(cls.driver, 10).until(
            lambda d: d.find_element(By.ID, "auth-view").is_displayed() or d.find_element(By.ID, "app-container").is_displayed()
        )
        auth_view = cls.driver.find_element(By.ID, "auth-view")
        if auth_view.is_displayed():
            login_btn = cls.driver.find_element(By.CSS_SELECTOR, "#auth-login-form button[type='submit']")
            login_btn.click()
            WebDriverWait(cls.driver, 10).until(
                EC.visibility_of_element_located((By.ID, "app-container"))
            )

    @classmethod
    def tearDownClass(cls):
        if cls.driver:
            cls.driver.quit()
        if cls.server_instance:
            cls.server_instance.shutdown()
            cls.server_instance.server_close()

    def setUp(self):
        # Reset to home view before each test
        self.driver.execute_script("window.App.switchTab('home');")
        time.sleep(0.15)

    # ================= TEST 1: Page Load & Initial State =================
    def test_01_page_load_and_branding(self):
        """Verify page title, brand header, workspace card, and default active tab."""
        self.assertIn("DevOnboard", self.driver.title)
        brand_title = self.driver.find_element(By.CLASS_NAME, "brand-title")
        self.assertEqual(brand_title.text, "DevOnboard")

        # Live Clock element present
        clock = self.driver.find_element(By.ID, "header-live-datetime")
        self.assertTrue(clock.is_displayed())

        # Sound toggle button defaults to Haptic ON
        sound_btn = self.driver.find_element(By.ID, "sound-toggle-btn")
        self.assertIn("Haptic ON", sound_btn.text)

    # ================= TEST 2: Haptic & Tactile Sound Toggle =================
    def test_02_haptic_sound_toggle(self):
        """Click haptic sound toggle and verify state switches between ON and OFF."""
        sound_btn = self.driver.find_element(By.ID, "sound-toggle-btn")
        self.assertIn("Haptic ON", sound_btn.text)

        # Toggle OFF
        self.driver.execute_script("arguments[0].click();", sound_btn)
        WebDriverWait(self.driver, 4).until(
            lambda d: "Haptic OFF" in d.find_element(By.ID, "sound-toggle-btn").text
        )
        self.assertTrue("muted" in sound_btn.get_attribute("class"))

        # Wait past 160ms debounce before toggling back ON
        time.sleep(0.3)
        self.driver.execute_script("arguments[0].click();", sound_btn)
        WebDriverWait(self.driver, 4).until(
            lambda d: "Haptic ON" in d.find_element(By.ID, "sound-toggle-btn").text
        )
        self.assertFalse("muted" in sound_btn.get_attribute("class"))

    # ================= TEST 3: Interactive CLI Terminal Drawer =================
    def test_03_interactive_cli_terminal(self):
        """Open CLI drawer, verify controls, execute commands, and verify DOM output."""
        drawer = self.driver.find_element(By.ID, "cli-drawer")
        pill_btn = self.driver.find_element(By.ID, "cli-toggle-pill-btn")

        # 1. Open drawer and execute 'status' command via workbench
        self.driver.execute_script("window.WorkbenchUI.runQuickCommand('status');")
        WebDriverWait(self.driver, 6).until(
            lambda d: "open" in d.find_element(By.ID, "cli-drawer").get_attribute("class")
        )
        self.assertIn("open", drawer.get_attribute("class"))
        self.assertIn("Minimize", pill_btn.text)

        # 2. Verify terminal output contains workspace telemetry
        body = self.driver.find_element(By.ID, "cli-terminal-body")
        WebDriverWait(self.driver, 8).until(
            lambda d: "Live Workspace Status" in body.text
        )
        self.assertIn("Alex Rivera", body.text)

        # 3. Minimize drawer by clicking pill
        time.sleep(0.3)
        self.driver.execute_script("arguments[0].click();", pill_btn)
        WebDriverWait(self.driver, 6).until(
            lambda d: "open" not in d.find_element(By.ID, "cli-drawer").get_attribute("class")
        )
        self.assertIn("Open", pill_btn.text)

    # ================= TEST 4: Evidence-Gated RAG Search =================
    def test_04_evidence_gated_rag_search(self):
        """Navigate to AI Assistant, submit an in-scope question, and verify Evidence Gate HUD."""
        # Switch tab via App controller
        self.driver.execute_script("window.App.switchTab('ai-mentor');")

        # Ask in-scope query by clicking the quick chip
        quick_chip = WebDriverWait(self.driver, 6).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '.chip[data-prompt*="PyTorch"]'))
        )
        self.driver.execute_script("arguments[0].click();", quick_chip)

        # Wait for AI response bubble to appear with content (and loading indicator gone)
        WebDriverWait(self.driver, 10).until(
            lambda d: not d.find_elements(By.CSS_SELECTOR, "#chat-messages-list .chat-msg.loading")
            and len(d.find_elements(By.CSS_SELECTOR, "#chat-messages-list .chat-msg.ai")) > 1
            and len(d.find_elements(By.CSS_SELECTOR, "#chat-messages-list .chat-msg.ai")[-1].text.strip()) > 10
        )

        messages = self.driver.find_elements(By.CSS_SELECTOR, "#chat-messages-list .chat-msg.ai")
        latest_reply = messages[-1].text
        self.assertGreater(len(latest_reply.strip()), 15)

        # Verify Gate HUD panel rendered
        hud_panel = self.driver.find_element(By.ID, "gate-hud-panel")
        self.assertTrue(len(hud_panel.text) > 0)

    # ================= TEST 5: Mentor Matching (XMM Engine) =================
    def test_05_mentor_matching_view(self):
        """Navigate to Mentor Network, verify mentor cards and algorithm sliders."""
        self.driver.execute_script("window.App.switchTab('mentor-matching');")

        # Wait for XMM Gini equity slider to be visible
        gini_slider = WebDriverWait(self.driver, 6).until(
            EC.visibility_of_element_located((By.ID, "beta5-slider"))
        )
        self.assertTrue(gini_slider.is_displayed())

        # Verify mentor recommendation cards exist
        cards = WebDriverWait(self.driver, 6).until(
            lambda d: d.find_elements(By.CLASS_NAME, "mentor-card")
        )
        self.assertGreaterEqual(len(cards), 1)

    # ================= TEST 6: Navigation Tab Switching =================
    def test_06_navigation_tab_switching(self):
        """Click multiple sidebar navigation items and confirm active tab views change."""
        tabs_to_test = [
            ("session-booking", "tab-session-booking"),
            ("community-forum", "tab-community-forum"),
            ("project-workspace", "tab-project-workspace"),
            ("progress-dashboard", "tab-progress-dashboard"),
            ("home", "tab-home"),
        ]

        for tab_data_attr, tab_pane_id in tabs_to_test:
            tab_el = WebDriverWait(self.driver, 6).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, f'div[data-tab="{tab_data_attr}"]'))
            )
            self.driver.execute_script("arguments[0].click();", tab_el)
            time.sleep(0.3)

            pane_el = self.driver.find_element(By.ID, tab_pane_id)
            self.assertIn("active", pane_el.get_attribute("class"))


if __name__ == '__main__':
    unittest.main()
