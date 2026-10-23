import pytest

from core.exceptions import BusinessRuleViolation, Unauthorized
from customers.domain.customer import Customer, CustomerStatus, validate_password_policy


@pytest.mark.parametrize("password", ["short1", "onlyletters", "12345678", "a1" * 33])
def test_password_policy_rejects(password):
    with pytest.raises(BusinessRuleViolation):
        validate_password_policy(password)


def test_password_policy_accepts():
    validate_password_policy("salad1234")


def test_register_normalizes_email_and_phone():
    c = Customer.register(" Leaf@Example.COM ", "hash", " 김샐러 ", "01012345678")
    assert c.email == "leaf@example.com"
    assert c.name == "김샐러"
    assert c.phone == "010-1234-5678"
    assert c.status is CustomerStatus.ACTIVE


@pytest.mark.parametrize(
    ("email", "name", "phone"),
    [("not-an-email", "김샐러", None), ("a@b.co", "   ", None), ("a@b.co", "김샐러", "02-123-4567")],
)
def test_register_rejects_invalid_values(email, name, phone):
    with pytest.raises(BusinessRuleViolation):
        Customer.register(email, "hash", name, phone)


def test_withdrawn_customer_cannot_login():
    c = Customer.register("a@b.co", "hash", "김샐러")
    c.status = CustomerStatus.WITHDRAWN
    with pytest.raises(Unauthorized):
        c.ensure_can_login()
