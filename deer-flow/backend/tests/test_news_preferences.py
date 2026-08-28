from app.gateway.routers.news_preferences import _matches_topics


def test_news_topic_match_uses_title_and_summary() -> None:
    assert (
        _matches_topics(
            {"title": "国产先进芯片发布", "summary": "供应链进入验证阶段"},
            ["足球", "芯片"],
        )
        == "芯片"
    )
    assert (
        _matches_topics(
            {"title": "市场动态", "summary": "人工智能企业公布新模型"},
            ["人工智能"],
        )
        == "人工智能"
    )
    assert (
        _matches_topics(
            {"title": "天气预报", "summary": "明日局部有雨"},
            ["机器人"],
        )
        is None
    )
