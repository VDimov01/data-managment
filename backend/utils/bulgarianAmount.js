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

  const parts = [];
  let groupIndex = 0;

  while (n > 0) {
    const trip = n % 1000;

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

      parts.push(groupWords);
    }

    groupIndex++;
    n = Math.floor(n / 1000);
  }

  return parts.reverse().join(" ");
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
