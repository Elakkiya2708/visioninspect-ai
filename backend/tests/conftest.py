"""Test bootstrap: isolated data dir + known secret, set BEFORE the app is imported."""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="visioninspect-test-")
os.environ["SECRET_KEY"] = "test-secret-key-0123456789-abcdef-0123456789"
os.environ["ADMIN_EMAIL"] = "admin@visioninspect.ai"
os.environ["ADMIN_PASSWORD"] = "Admin@123"
os.environ["SEED_DEMO_USERS"] = "true"
