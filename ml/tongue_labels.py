from __future__ import annotations

CLASSES: dict[str, int] = {
    "normal": 0,
    "white_coat": 1,
    "yellow_coat": 2,
    "red_tongue": 3,
    "pale_tongue": 4,
    "greasy_coat": 5,
    "thick_coat": 6,
    "thin_coat": 7,
}

IDX_TO_CLASS: dict[int, str] = {index: name for name, index in CLASSES.items()}

CLASS_DISPLAY_NAMES: dict[str, str] = {
    "normal": "正常舌象",
    "white_coat": "白苔",
    "yellow_coat": "黃苔",
    "red_tongue": "紅舌",
    "pale_tongue": "淡白舌",
    "greasy_coat": "膩苔",
    "thick_coat": "厚苔",
    "thin_coat": "薄苔",
}

CLASS_TCM_INFO: dict[str, dict[str, str]] = {
    "normal": {"syndrome": "正常舌象", "constitution": "平和質"},
    "white_coat": {"syndrome": "虛寒證", "constitution": "陽虛質"},
    "yellow_coat": {"syndrome": "實熱證", "constitution": "濕熱質"},
    "red_tongue": {"syndrome": "心火盛 / 熱證", "constitution": "陰虛質"},
    "pale_tongue": {"syndrome": "氣血兩虛", "constitution": "氣虛質"},
    "greasy_coat": {"syndrome": "痰濕 / 濕濁", "constitution": "痰濕質"},
    "thick_coat": {"syndrome": "邪氣偏盛", "constitution": "多見於實證"},
    "thin_coat": {"syndrome": "病初起或正常薄苔", "constitution": "需結合舌色判斷"},
}

RECOMMENDATIONS_DB: dict[str, dict[str, object]] = {
    "normal": {
        "summary": "舌象大致平穩，可先維持目前作息與飲食節律。",
        "food": ["均衡飲食", "溫熱熟食", "適量飲水"],
        "avoid": ["暴飲暴食", "長期熬夜", "過量冰飲"],
        "lifestyle": ["維持規律睡眠", "每週固定活動", "定期觀察身體變化"],
        "warning": None,
    },
    "white_coat": {
        "summary": "白苔常見於寒象或陽氣不足傾向，需結合怕冷、腹瀉等感受判斷。",
        "food": ["生薑紅棗茶", "桂圓粥", "溫熱湯品"],
        "avoid": ["生冷食物", "冰飲", "寒涼水果過量"],
        "lifestyle": ["注意腹部與足部保暖", "避免長時間受寒", "保持規律作息"],
        "warning": None,
    },
    "yellow_coat": {
        "summary": "黃苔多與熱象或濕熱傾向相關，可留意口苦、口黏、尿色偏黃等情況。",
        "food": ["菊花茶", "綠豆湯", "冬瓜湯", "薏仁水"],
        "avoid": ["辛辣燒烤", "酒類", "油炸食品"],
        "lifestyle": ["補足睡眠", "避免悶熱環境久待", "飲食走清淡路線"],
        "warning": None,
    },
    "red_tongue": {
        "summary": "紅舌常見於熱象或陰液不足傾向，舌尖明顯偏紅時可留意睡眠與情緒壓力。",
        "food": ["百合銀耳湯", "蓮子心茶", "麥冬茶", "冬瓜湯"],
        "avoid": ["咖啡過量", "辛辣", "酒精", "油炸"],
        "lifestyle": ["減少熬夜", "安排放鬆時間", "避免過度情緒刺激"],
        "warning": "若伴隨口腔潰瘍、失眠、心悸或發熱，建議尋求專業醫療協助。",
    },
    "pale_tongue": {
        "summary": "淡白舌常見於氣血不足傾向，可搭配疲倦、頭暈、面色偏白等狀態觀察。",
        "food": ["紅棗枸杞茶", "山藥粥", "黑木耳湯", "溫和蛋白質"],
        "avoid": ["過度節食", "生冷食物", "長時間空腹"],
        "lifestyle": ["避免過勞", "溫和有氧活動", "保留恢復時間"],
        "warning": "若長期頭暈、倦怠或面色蒼白，建議檢查血色素與相關健康指標。",
    },
    "greasy_coat": {
        "summary": "膩苔多提示痰濕或消化負擔偏重，可留意胸悶、身重困倦或口中黏膩。",
        "food": ["薏仁紅豆水", "陳皮茶", "山楂茶", "冬瓜湯"],
        "avoid": ["甜食", "油膩食品", "乳製品過量", "酒類"],
        "lifestyle": ["飯後散步", "避免久坐", "飲食減少厚重調味"],
        "warning": None,
    },
    "thick_coat": {
        "summary": "厚苔常見於消化積滯或外邪偏盛傾向，需觀察是否伴隨腹脹、口氣或排便改變。",
        "food": ["白蘿蔔湯", "山楂消食茶", "麥芽水"],
        "avoid": ["暴飲暴食", "難消化食物", "宵夜過量"],
        "lifestyle": ["規律飲食", "細嚼慢嚥", "減少睡前進食"],
        "warning": "若厚苔持續加重或伴隨明顯腸胃不適，建議就醫評估。",
    },
    "thin_coat": {
        "summary": "薄苔可見於正常舌象，也可能見於病初起階段，需與舌色、濕潤度一起判讀。",
        "food": ["清淡熟食", "溫水", "當季蔬菜"],
        "avoid": ["忽冷忽熱飲食", "過度辛辣", "過度進補"],
        "lifestyle": ["持續觀察變化", "保持口腔清潔", "避免短期內反覆熬夜"],
        "warning": None,
    },
}
