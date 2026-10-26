"""나만의 볼 저장 입력과 기본 검증 규칙."""

from dataclasses import dataclass

from core.exceptions import BusinessRuleViolation


@dataclass(frozen=True)
class RecipeDraft:
    name: str
    ingredient_ids: tuple[str, ...]
    dressing_key: str

    def __post_init__(self) -> None:
        if not 1 <= len(self.name.strip()) <= 30:
            raise BusinessRuleViolation("조합 이름은 1~30자로 입력해주세요.")

        if not self.ingredient_ids:
            raise BusinessRuleViolation("재료를 하나 이상 선택해주세요.")

        if any(not ingredient_id.strip() for ingredient_id in self.ingredient_ids):
            raise BusinessRuleViolation("재료 번호가 비어 있습니다.")

        if len(set(self.ingredient_ids)) != len(self.ingredient_ids):
            raise BusinessRuleViolation("같은 재료를 중복해서 선택할 수 없습니다.")

        if not self.dressing_key.strip():
            raise BusinessRuleViolation("드레싱을 선택해주세요.")

    @classmethod
    def create(
        cls,
        *,
        name: str,
        ingredient_ids: list[str] | tuple[str, ...],
        dressing_key: str,
    ) -> "RecipeDraft":
        return cls(
            name=name.strip(),
            ingredient_ids=tuple(ingredient_ids),
            dressing_key=dressing_key.strip(),
        )
