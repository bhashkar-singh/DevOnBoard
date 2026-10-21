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

    @classmethod
    def tearDownClass(cls):
        if cls.driver:
            cls.driver.quit()
        if cls.server_instance:
            cls.server_instance.shutdown()
            cls.server_instance.server_close()

    def setUp(self):
        # Ensure fresh page load
        self.driver.get(self.base_url)
        # Wait until brand title is rendered
        WebDriverWait(self.driver, 8).until(
            EC.presence_of_element_located((By.CLASS_NAME, "brand-title"))
        )

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
        sound_btn.click()
        time.sleep(0.3)
        self.assertIn("Haptic OFF", sound_btn.text)
        self.assertTrue("muted" in sound_btn.get_attribute("class"))

        # Toggle back ON
        sound_btn.click()
        time.sleep(0.3)
        self.assertIn("Haptic ON", sound_btn.text)
        self.assertFalse("muted" in sound_btn.get_attribute("class"))

    # ================= TEST 3: Interactive CLI Terminal Drawer =================
    def test_03_interactive_cli_terminal(self):
        """Open CLI drawer, verify controls, execute commands, and verify DOM output."""
        drawer = self.driver.find_element(By.ID, "cli-drawer")
        header = self.driver.find_element(By.ID, "cli-bar-header")
        pill_btn = self.driver.find_element(By.ID, "cli-toggle-pill-btn")

        # 1. Open drawer by clicking header
        if "open" not in drawer.get_attribute("class"):
            header.click()
            time.sleep(0.4)

        self.assertIn("open", drawer.get_attribute("class"))
        self.assertIn("Minimize", pill_btn.text)

        # 2. Type 'status' into the terminal input
        cli_input = self.driver.find_element(By.ID, "cli-terminal-input")
        cli_input.clear()
        cli_input.send_keys("status")
        cli_input.send_keys(Keys.ENTER)

        # 3. Verify terminal output contains workspace telemetry
        body = self.driver.find_element(By.ID, "cli-terminal-body")
        WebDriverWait(self.driver, 6).until(
            lambda d: "Live Workspace Status" in body.text
        )
        self.assertIn("Alex Rivera", body.text)

        # 4. Minimize drawer by clicking pill
        pill_btn.click()
        time.sleep(0.3)
        self.assertNotIn("open", drawer.get_attribute("class"))
        self.assertIn("Open", pill_btn.text)

    # ================= TEST 4: Evidence-Gated RAG Search =================
    def test_04_evidence_gated_rag_search(self):
        """Navigate to AI Assistant, submit an in-scope question, and verify Evidence Gate HUD."""
        # Click AI Assistant nav tab
        ai_tab = self.driver.find_element(By.CSS_SELECTOR, 'div[data-tab="ai-mentor"]')
        ai_tab.click()

        # Wait for chat input
        chat_input = WebDriverWait(self.driver, 6).until(
            EC.visibility_of_element_located((By.ID, "chat-input"))
        )

        # Ask in-scope query
        chat_input.clear()
        chat_input.send_keys("How do I build PyTorch from source?")
        self.driver.find_element(By.CSS_SELECTOR, "#chat-form button[type='submit']").click()

        # Wait for AI response bubble to appear
        WebDriverWait(self.driver, 8).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, "#chat-messages-list .chat-msg.ai")) > 1
        )

        messages = self.driver.find_elements(By.CSS_SELECTOR, "#chat-messages-list .chat-msg.ai")
        latest_reply = messages[-1].text
        self.assertTrue(
            "Ninja" in latest_reply or "setup.py" in latest_reply or "GROUNDED" in latest_reply or "PyTorch" in latest_reply
        )

        # Verify Gate HUD panel rendered
        hud_panel = self.driver.find_element(By.ID, "gate-hud-panel")
        self.assertTrue(len(hud_panel.text) > 0)

    # ================= TEST 5: Mentor Matching (XMM Engine) =================
    def test_05_mentor_matching_view(self):
        """Navigate to Mentor Network, verify mentor cards and algorithm sliders."""
        matcher_tab = self.driver.find_element(By.CSS_SELECTOR, 'div[data-tab="mentor-matching"]')
        matcher_tab.click()

        # Wait for mentor cards container
        cards_container = WebDriverWait(self.driver, 6).until(
            EC.presence_of_element_located((By.ID, "mentor-cards-container"))
        )

        # Verify mentor recommendation cards exist
        cards = WebDriverWait(self.driver, 6).until(
            lambda d: d.find_elements(By.CLASS_NAME, "mentor-card")
        )
        self.assertGreaterEqual(len(cards), 1)

        # Verify XMM Gini equity slider is present
        gini_slider = self.driver.find_element(By.ID, "xmm-beta5-slider")
        self.assertTrue(gini_slider.is_displayed())

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
            tab_el = self.driver.find_element(By.CSS_SELECTOR, f'div[data-tab="{tab_data_attr}"]')
            tab_el.click()
            time.sleep(0.2)

            pane_el = self.driver.find_element(By.ID, tab_pane_id)
            self.assertIn("active", pane_el.get_attribute("class"))


if __name__ == '__main__':
    unittest.main()
