"""영수증 행(도메인 ReceiptRow)을 PNG 이미지로 그린다 (Pillow).

서버 OS 에 한글 폰트가 없어도 같은 결과가 나오도록 나눔고딕(SIL OFL, backend/assets/fonts)을 함께 배포한다.
좌표는 논리 폭 WIDTH 기준으로 계산하고, 결과 이미지는 OUTPUT_WIDTH(720px) 폭이 되도록 SCALE 배로 그린다.
"""

from collections.abc import Callable
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from orders.domain.receipt import Receipt, ReceiptRow, RowKind

FONT_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"
WIDTH, PAD, BAR = 640, 44, 8
OUTPUT_WIDTH = 720  # 내려받는 이미지의 가로 픽셀
SCALE = OUTPUT_WIDTH / WIDTH
CONTENT = WIDTH - PAD * 2
LABEL_COLUMN = 96  # 라벨 칸 너비. 값은 나머지 칸에 오른쪽 정렬
PAPER, INK, MUTED, LINE, ACCENT, ALERT = "#ffffff", "#1f2937", "#6b7280", "#d1d5db", "#1b4332", "#b91c1c"

Draw = Callable[[ImageDraw.ImageDraw], None]


@lru_cache
def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "NanumGothic-Bold.ttf" if bold else "NanumGothic-Regular.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), round(size * SCALE))


def _width(text: str, font: ImageFont.FreeTypeFont) -> float:
    return font.getlength(text) / SCALE


def wrap(text: str, font: ImageFont.FreeTypeFont, max_width: float) -> list[str]:
    """max_width(논리 단위)에 맞춰 줄을 나눈다. 가능하면 공백에서, 안 되면 글자 단위로 자른다."""
    lines: list[str] = []
    line = ""
    for ch in text:
        if line and _width(line + ch, font) > max_width:
            cut = line.rfind(" ")
            if cut > 0:
                lines.append(line[:cut])
                line = line[cut + 1 :]
            else:
                lines.append(line)
                line = ""
        line += ch
    lines.append(line)
    return [part.strip() for part in lines if part.strip()] or [""]


class PillowReceiptRenderer:
    media_type = "image/png"

    def render(self, receipt: Receipt) -> bytes:
        draws, height = self._layout(receipt.rows(), receipt.canceled)
        image = Image.new("RGB", (OUTPUT_WIDTH, round(height * SCALE)), PAPER)
        canvas = ImageDraw.Draw(image)
        canvas.rectangle((0, 0, OUTPUT_WIDTH, round(BAR * SCALE)), fill=ACCENT)
        canvas.rectangle((0, image.height - round(BAR * SCALE), OUTPUT_WIDTH, image.height), fill=ACCENT)
        for draw in draws:
            draw(canvas)
        out = BytesIO()
        image.save(out, format="PNG", optimize=True)
        return out.getvalue()

    def _layout(self, rows: list[ReceiptRow], canceled: bool) -> tuple[list[Draw], float]:
        draws: list[Draw] = []
        y = BAR + PAD

        def text(x: float, top: float, value: str, font: ImageFont.FreeTypeFont, fill: str, anchor: str = "la") -> None:
            draws.append(lambda c: c.text((x * SCALE, top * SCALE), value, font=font, fill=fill, anchor=anchor))

        for row in rows:
            if row.kind is RowKind.TITLE:
                text(WIDTH / 2, y, row.left, _font(26, bold=True), ACCENT, "ma")
                y += 44
                if canceled:
                    stamp = _font(15, bold=True)
                    w = _width("취소된 주문", stamp) + 28
                    box = ((WIDTH - w) / 2, y - 6, (WIDTH + w) / 2, y + 24)
                    draws.append(
                        lambda c, b=box: c.rounded_rectangle(
                            [v * SCALE for v in b], radius=round(6 * SCALE), outline=ALERT, width=2
                        )
                    )
                    text(WIDTH / 2, y, "취소된 주문", stamp, ALERT, "ma")
                    y += 40
            elif row.kind is RowKind.FIELD:
                alert = canceled and row.left in ("주문상태", "결제상태")
                value_font = _font(16, bold=alert)
                text(PAD, y, row.left, _font(16), MUTED)
                for line in wrap(row.right, value_font, CONTENT - LABEL_COLUMN):
                    text(WIDTH - PAD, y, line, value_font, ALERT if alert else INK, "ra")
                    y += 26
                y += 4
            elif row.kind is RowKind.DIVIDER:
                y += 6
                line_y = y
                draws.append(
                    lambda c, ly=line_y: [
                        c.line(((x * SCALE, ly * SCALE), ((x + 6) * SCALE, ly * SCALE)), fill=LINE, width=1)
                        for x in range(PAD, WIDTH - PAD - 5, 10)
                    ]
                )
                y += 20
            elif row.kind is RowKind.ITEM:
                item_font = _font(17, bold=True)
                amount_width = _width(row.right, item_font)
                text(WIDTH - PAD, y, row.right, item_font, INK, "ra")
                for line in wrap(row.left, item_font, CONTENT - amount_width - 16):
                    text(PAD, y, line, item_font, INK)
                    y += 28
            elif row.kind is RowKind.DETAIL:
                detail_font = _font(14)
                for line in wrap(row.left, detail_font, CONTENT - 14):
                    text(PAD + 14, y, line, detail_font, MUTED)
                    y += 22
                y += 4
            elif row.kind is RowKind.TOTAL:
                total_font = _font(21, bold=True)
                color = ALERT if canceled else ACCENT
                y += 4
                text(PAD, y, row.left, total_font, color)
                text(WIDTH - PAD, y, row.right, total_font, color, "ra")
                y += 38
            elif row.kind is RowKind.NOTE:
                note_font = _font(13)
                for line in wrap(row.left, note_font, CONTENT):
                    text(PAD, y, line, note_font, MUTED)
                    y += 21
        return draws, y + PAD + BAR
