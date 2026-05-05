"""AI auto-mode fallback helpers。

當 AI_PROVIDER=auto 時，Anthropic 失敗就試 OpenAI。如果兩個都失敗，
要顯示有用嘅 combined error message — 尤其係 OpenAI 喺香港遇 403
territory block 嗰陣（即係 VPN 未連），要提示用戶真正原因。
"""

from __future__ import annotations


def _is_territory_block(err: Exception) -> bool:
    """偵測 OpenAI 嘅 territory 403（香港不支援）。"""
    msg = str(err)
    return (
        "unsupported_country_region_territory" in msg
        or "request_forbidden" in msg
        or ("403" in msg and "country" in msg.lower())
    )


def combined_fallback_error(
    primary_err: Exception,
    fallback_err: Exception,
    *,
    primary_name: str = "Anthropic",
    fallback_name: str = "OpenAI",
) -> RuntimeError:
    """兩個 provider 都失敗時，拼一個 human-readable RuntimeError。

    如果 fallback 係 territory block（香港 VPN 問題），提示用戶
    真正嘅 primary 失敗原因 + VPN 提示。
    """
    if _is_territory_block(fallback_err):
        return RuntimeError(
            f"{primary_name} 失敗：{primary_err}；"
            f"{fallback_name} 不可用（VPN 未連？）。請檢查 VPN 或將 AI_PROVIDER 設為 {primary_name.lower()}。"
        )
    return RuntimeError(
        f"{primary_name}：{primary_err} | {fallback_name} fallback：{fallback_err}"
    )
