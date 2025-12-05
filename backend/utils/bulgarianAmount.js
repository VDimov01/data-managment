// backend/utils/bulgarianAmount.js

function tripletToWordsBG(num, gender = "m") {
  const onesMasculine = [
    "нула", "един", "два", "три", "четири",
    "пет", "шест", "седем", "осем", "девет"
  ];

  const onesFeminine = [
    "нула", "една", "две", "три", "четири",
    "пет", "шест", "седем", "осем", "девет"
  ];

  const ones = gender === "f" ? onesFeminine : onesMasculine;

  const teens = [
    "десет", "единадесет", "дванадесет", "тринадесет", "четиринадесет",
    "петнадесет", "шестнадесет", "седемнадесет", "осемнадесет", "деветнадесет"
  ];

  const tens = [
    "", "", "двадесет", "тридесет", "четиридесет",
    "петдесет", "шестдесет", "седемдесет", "осемдесет", "деветдесет"
  ];

  const hundreds = [
    "", "сто", "двеста", "триста", "четиристотин",
    "петстотин", "шестстотин", "седемстотин", "осемстотин", "деветстотин"
  ];

  if (num === 0) return "";

  const parts = [];
  const h = Math.floor(num / 100);
  const rest = num % 100;

  if (h > 0) {
    parts.push(hundreds[h]);
  }

  if (rest > 0) {
    if (h > 0) parts.push("и");

    if (rest < 10) {
      parts.push(ones[rest]);
    } else if (rest >= 10 && rest < 20) {
      parts.push(teens[rest - 10]);
    } else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(tens[t]);
      if (u > 0) {
        parts.push("и");
        parts.push(ones[u]);
      }
    }
  }

  return parts.join(" ");
}

function integerToWordsBG(n, genderForUnits = "m") {
  if (n === 0) return "нула";
  if (!Number.isInteger(n)) n = Math.floor(n);
  if (n < 0) {
    return "минус " + integerToWordsBG(Math.abs(n), genderForUnits);
  }

  // Събираме групите с информация за:
  // - idx: 0 = единици, 1 = хиляди, 2 = милиони, ...
  // - trip: числото в тази група (0–999)
  // - words: текст за тази група
  const groups = [];
  let groupIndex = 0;
  let remaining = n;

  while (remaining > 0) {
    const trip = remaining % 1000;

    if (trip > 0) {
      let groupWords = "";

      if (groupIndex === 0) {
        // единици (левове / стотинки)
        groupWords = tripletToWordsBG(trip, genderForUnits);
      } else if (groupIndex === 1) {
        // хиляди
        if (trip === 1) {
          groupWords = "хиляда";
        } else {
          groupWords = tripletToWordsBG(trip, "f") + " хиляди";
        }
      } else if (groupIndex === 2) {
        // милиони
        if (trip === 1) {
          groupWords = "един милион";
        } else {
          groupWords = tripletToWordsBG(trip, "m") + " милиона";
        }
      } else if (groupIndex === 3) {
        // милиарди
        if (trip === 1) {
          groupWords = "един милиард";
        } else {
          groupWords = tripletToWordsBG(trip, "m") + " милиарда";
        }
      } else {
        // над милиард – малко вероятно за коли, но все пак
        groupWords = tripletToWordsBG(trip, "m");
      }

      groups.push({ idx: groupIndex, trip, words: groupWords });
    }

    groupIndex++;
    remaining = Math.floor(remaining / 1000);
  }

  // Обръщаме: от най-голямата група към единиците
  groups.reverse();

  if (groups.length === 0) return "нула";
  if (groups.length === 1) return groups[0].words;

  // Специален случай: точно две групи – ХИЛЯДИ + ЕДИНИЦИ,
  // и долната група е "чисти стотици" → вмъкваме "и".
  //
  // Примери:
  //  1 500   → "хиляда и петстотин"
  // 72 500   → "седемдесет и две хиляди и петстотин"
  //
  // 33 325   остава "тридесет и три хиляди триста и двадесет и пет"
  if (
    groups.length === 2 &&
    groups[0].idx === 1 && // горната група са хиляди
    groups[1].idx === 0    // долната – единици
  ) {
    const lowTrip = groups[1].trip;
    if (lowTrip >= 100 && lowTrip % 100 === 0) {
      return `${groups[0].words} и ${groups[1].words}`;
    }
  }

  // Всички останали случаи – просто join с интервал
  return groups.map(g => g.words).join(" ");
}

function amountToBGWords(amount) {
  if (typeof amount !== "number") {
    amount = Number(amount);
  }
  if (!isFinite(amount)) return "";

  // Работи в стотинки, за да избегнем плаващи грешки
  const allStotinki = Math.round(amount * 100);
  const leva = Math.floor(allStotinki / 100);
  const stotinki = allStotinki % 100;

  const levaWords = integerToWordsBG(leva, "m");
  const levaUnit = leva === 1 ? "лев" : "лева";

  if (stotinki === 0) {
    return `${levaWords} ${levaUnit}`;
  }

  const stotinkiWords = integerToWordsBG(stotinki, "f");
  const stotinkiUnit = stotinki === 1 ? "стотинка" : "стотинки";

  return `${levaWords} ${levaUnit} и ${stotinkiWords} ${stotinkiUnit}`;
}

module.exports = {
  amountToBGWords,
  integerToWordsBG
};
