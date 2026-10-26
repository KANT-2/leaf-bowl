from pydantic import BaseModel, ConfigDict


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    name_en: str | None
    price: int
    category: str
    badge: str
    status: str
    image_url: str
    allergens: list[str]


class MenuPageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[ProductResponse]
    page: int
    size: int
    total: int
