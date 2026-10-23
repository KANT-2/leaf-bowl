"""create_all 이 테이블을 찾을 수 있도록 각 기능의 ORM 모델을 여기서 import 한다.

기능을 추가하면 한 줄씩 늘린다.
"""

from auth.infrastructure import models as auth_models  # noqa: F401
from customers.infrastructure import models as customer_models  # noqa: F401
