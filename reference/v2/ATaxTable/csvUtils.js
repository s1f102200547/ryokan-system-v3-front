// src/utils/csvUtils.js

// 出力する列（順番固定）
export const CSV_COLUMNS = [
  "a_tax_received",
  "check_in_date",
  "room",
  "guest_name",
  "adult_count",
  "nights",
  "booking_site",
  "tax",
  "a_tax_received_by_staff_name",
  "x",
  "adultNightSum"
];

// 日本語ヘッダ
export const CSV_HEADERS_JA = [
  "受領済み",
  "C/I日",
  "部屋",
  "ゲスト名",
  "大人人数",
  "泊数",
  "予約サイト",
  "宿泊税",
  "受領スタッフ名",
  "締めスタッフ名",
  "大人人数×泊数"
];

export const convertToCSV = (rows) => {
  if (!rows || rows.length === 0) return "";

  const BOM = "\uFEFF"; // Excel 文字化け防止

  const header = CSV_HEADERS_JA.join(",");

  // ★ 月合計（adultNightSum の総和）
  const totalAdultNightSum = rows.reduce((sum, r) => {
    const v = r.adultNightSum;
    return sum + (typeof v === "number" ? v : 0);
  }, 0);

  // ★ 通常行（すべて null → "" に統一）
  const body = rows
    .map(row =>
      CSV_COLUMNS.map(col => {
        let val = row[col];

        if (val === null || val === undefined) {
          val = "";
        } else {
          val = String(val);
        }

        // C/I日の Excel 自動変換を防ぐ
        if (col === "check_in_date" && val !== "") {
          val = `="${val}"`;
        }

        val = val.replace(/"/g, '""');

        return `"${val}"`;
      }).join(",")
    )
    .join("\n");

  // ★ 合計行を最後に追加（大人人数×泊数のみ値を持つ）
  const totalRow =
    [
      "", "", "", "", "", "", "", "", "", "\"合計\"",  // 表示列
      `"${totalAdultNightSum}"`
    ].slice(0, CSV_COLUMNS.length + 1) // 保険として列数調整
      .join(",");

  return BOM + header + "\n" + body + "\n" + totalRow;
};

export const downloadCSV = (csvString, filename = "export.csv") => {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
