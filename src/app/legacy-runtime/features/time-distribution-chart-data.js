const DEFAULT_MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export function buildTimeDistributionChartData({ messages = [], year = null, month = null, day = null, text = {} } = {}) {
  if (year && month && day) {
    const data = Array(24).fill(0);
    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      if (msgDate.getFullYear() === year && msgDate.getMonth() + 1 === month && msgDate.getDate() === day) {
        data[msgDate.getHours()]++;
      }
    });
    return {
      chartType: 'line',
      label: `${year}${text.yearSuffix || '年'}${month}${text.monthSuffix || '月'}${day}${text.daySuffix || '日'} ${text.hourlyMessageCount || '每小時訊息數'}`,
      labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
      data
    };
  }

  if (year && month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = Array(daysInMonth).fill(0);
    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      if (msgDate.getFullYear() === year && msgDate.getMonth() + 1 === month) {
        data[msgDate.getDate() - 1]++;
      }
    });
    return {
      chartType: 'bar',
      label: `${year}${text.yearSuffix || '年'}${month}${text.monthSuffix || '月'} ${text.dailyMessageCount || '每日訊息數'}`,
      labels: Array.from({ length: daysInMonth }, (_, i) => `${i + 1}${text.daySuffix || '日'}`),
      data
    };
  }

  if (year) {
    const data = Array(12).fill(0);
    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      if (msgDate.getFullYear() === year) {
        data[msgDate.getMonth()]++;
      }
    });
    return {
      chartType: 'line',
      label: `${year}${text.yearSuffix || '年'} ${text.monthlyMessageCount || '每月訊息數'}`,
      labels: text.months || DEFAULT_MONTH_LABELS,
      data
    };
  }

  const years = [...new Set(messages.map((msg) => new Date(msg.createdAt).getFullYear()))].sort();
  return {
    chartType: 'bar',
    label: text.yearlyMessageCount || '每年訊息數',
    labels: years.map(String),
    data: years.map((selectedYear) => messages.filter((msg) => new Date(msg.createdAt).getFullYear() === selectedYear).length)
  };
}
