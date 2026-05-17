from enum import Enum


class UserRole(str, Enum):
    STUDENT = "Student"
    ADMIN = "Admin"


class RequestStatus(str, Enum):
    PENDING_PAYMENT = "Pending Payment"
    UNDER_REVIEW = "Under Review"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    GENERATED = "Generated"
