"""Vercel 입구. Vercel 은 프로젝트 루트의 index.py 에서 FastAPI 인스턴스 `app` 을 찾는다.

앱 코드는 src/ 아래에서 `from auth ...` 처럼 패키지 이름으로 서로를 불러오므로 (로컬은 --app-dir src),
src 를 import 경로에 넣은 뒤 main.app 을 그대로 내보낸다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from main import app  # noqa: E402

__all__ = ["app"]
