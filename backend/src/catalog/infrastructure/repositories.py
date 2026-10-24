"""카탈로그 데이터를 DB에서 조회하는 저장소."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from catalog.domain.product import MenuQuery, Product, SortKey


class SqlProductRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_categories(self) -> list[str]:
        result = await self.session.scalars(text("SELECT name FROM categories ORDER BY sort_order, name"))
        return list(result)

    async def search(self, query: MenuQuery) -> tuple[list[Product], int]:
        where_sql, params = build_menu_filter(query)

        order_sql = {
            SortKey.DEFAULT: "p.sort_order, p.id",
            SortKey.PRICE_LOW: "p.price ASC, p.id",
            SortKey.PRICE_HIGH: "p.price DESC, p.id",
        }[query.sort]

        total = await self.session.scalar(
            text(f"""
                SELECT COUNT(*)
                FROM products AS p
                WHERE {where_sql}
            """),
            params,
        )

        result = await self.session.execute(
            text(f"""
                SELECT
                    p.customer_id AS id,
                    p.id AS key,
                    p.name,
                    p.name_en,
                    p.price,
                    p.category,
                    p.badge,
                    p.status,
                    p.image AS image_url,
                    ARRAY(
                        SELECT a.name
                        FROM product_allergens AS pa
                        JOIN allergens AS a ON a.id = pa.allergen_id
                        WHERE pa.product_id = p.id
                        ORDER BY pa.position, a.id
                    ) AS allergens
                FROM products AS p
                WHERE {where_sql}
                ORDER BY {order_sql}
                LIMIT :size OFFSET :offset
            """),
            {**params, "size": query.size, "offset": query.offset},
        )

        items = []
        for row in result.mappings():
            data = dict(row)
            data["allergens"] = tuple(data["allergens"])
            items.append(Product(**data))

        return items, int(total or 0)

    async def list_allergens(self) -> list[str]:
        result = await self.session.scalars(text("SELECT name FROM allergens ORDER BY id"))
        return list(result)


def build_menu_filter(query: MenuQuery) -> tuple[str, dict]:
    conditions = [
        "p.type = 'salad'",
        "p.deleted = false",
        "p.status IN ('active', 'soldout')",
        "p.customer_id IS NOT NULL",
    ]
    params = {}

    if query.q is not None:
        conditions.append("""
            (
                p.name ILIKE :keyword
                OR p.name_en ILIKE :keyword
                OR p.ingredients ILIKE :keyword
            )
        """)
        params["keyword"] = f"%{query.q}%"

    if query.category is not None:
        conditions.append("p.category = :category")
        params["category"] = query.category

    if query.min_price is not None:
        conditions.append("p.price >= :min_price")
        params["min_price"] = query.min_price

    if query.max_price is not None:
        conditions.append("p.price <= :max_price")
        params["max_price"] = query.max_price

    if query.exclude_allergens:
        conditions.append("""
            NOT EXISTS (
                SELECT 1
                FROM product_allergens AS pa
                JOIN allergens AS a ON a.id = pa.allergen_id
                WHERE pa.product_id = p.id
                  AND a.name = ANY(CAST(:excluded AS text[]))
            )
        """)
        params["excluded"] = list(query.exclude_allergens)

    return " AND ".join(conditions), params
