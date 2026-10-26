"""영수증 PNG 렌더러: 유효한 PNG 인지, 크기·줄바꿈이 내용에 맞게 바뀌는지 검증한다.

그림에 들어가는 내용(행) 자체는 test_order_receipt.py 가 검증한다.
"""

from datetime import UTC, datetime
from io import BytesIO

from PIL import Image

from orders.domain.order import OrderStatus
from orders.domain.receipt import Receipt
from orders.infrastructure.receipt_image import SCALE, WIDTH, PillowReceiptRenderer, _font, wrap
from test_order_receipt import ISSUED, placed

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def render(order) -> Image.Image:
    data = PillowReceiptRenderer().render(Receipt(order, issued_at=ISSUED))
    assert data.startswith(PNG_SIGNATURE)
    image = Image.open(BytesIO(data))
    image.load()
    return image


def test_renders_a_png_at_double_scale():
    image = render(placed())
    assert image.format == "PNG"
    assert image.width == WIDTH * SCALE
    assert image.height > image.width  # 세로로 긴 영수증
    assert PillowReceiptRenderer.media_type == "image/png"


def test_canceled_receipt_and_long_values_make_the_image_taller():
    base = render(placed()).height
    canceled = render(
        placed(
            status=OrderStatus.CANCELED,
            canceled_at=datetime(2026, 10, 10, 3, 20, tzinfo=UTC),
            cancel_reason="일정이 바뀌어서 취소합니다 " * 4,
        )
    ).height
    assert canceled > base


def test_wrap_breaks_long_text_to_fit_and_keeps_short_text():
    font = _font(16)
    assert wrap("짧은 주소", font, 400) == ["짧은 주소"]
    lines = wrap("서울특별시 중구 세종대로 110 서울특별시청 본관 " * 3, font, 300)
    assert len(lines) > 1
    assert all(font.getlength(line) / SCALE <= 300 for line in lines)
    assert wrap("가" * 80, font, 200)  # 공백이 없어도 글자 단위로 자른다
