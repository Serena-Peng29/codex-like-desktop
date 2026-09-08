#!/usr/bin/env python3
"""深知可信搜索 SkillHub / WorkBuddy public 版初始化检查。

Public 版统一只从环境变量 DKNOWC_API_KEY 读取 API Key，不读取、不写入本地 config.ini 中的 Key。
"""

import json
import os


API_KEY_ENV = "DKNOWC_API_KEY"
PLACEHOLDER_KEYS = {"", "your_api_key_here", "你的深知可信搜索 API Key", "你的深知搜索 API Key"}


def _looks_like_key(value: str) -> bool:
    value = (value or "").strip()
    return value not in PLACEHOLDER_KEYS and value.startswith("sk-")


def check_api_key_config():
    api_key = os.environ.get(API_KEY_ENV, "").strip()
    if _looks_like_key(api_key):
        return {
            "api_key_configured": True,
            "api_key_env": API_KEY_ENV,
            "api_key_source": "environment",
            "api_key_hint": None,
            "search_ready": True,
            "search_note": None,
        }

    return {
        "api_key_configured": False,
        "api_key_env": API_KEY_ENV,
        "api_key_source": None,
        "api_key_hint": f"本 Skill 需要通过 {API_KEY_ENV} 连接深知可信智能服务以获取可信内容。当前未检测到可用 Key，请先注册或登录深知智能 MaaS 账号并获取 API Key。",
        "search_ready": False,
        "search_note": f"当前缺少 {API_KEY_ENV}，暂时不能查询政策法规、办事流程、标准依据和可信溯源内容。",
    }


def main():
    status = check_api_key_config()
    blocking_issues = []
    if not status["api_key_configured"]:
        blocking_issues.append("api_key_missing")

    print(json.dumps({
        **status,
        "blocking_issues": blocking_issues,
        "ready": not blocking_issues,
        "maas_platform_url": "https://platform.dknowc.cn/",
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
