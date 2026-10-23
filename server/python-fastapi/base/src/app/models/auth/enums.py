"""enums.py belongs: the auth capability's closed value sets, each a `StrEnum`.
It does not belong: open-ended strings, limits (`models/user/constants.py`), object shapes
(`type.py`) or policy (`config/constants.py`).
"""

from enum import StrEnum


class OtpPurpose(StrEnum):
    login = "login"
    verify = "verify"
