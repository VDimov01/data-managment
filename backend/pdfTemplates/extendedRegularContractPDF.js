const { amountToBGWords } = require("../utils/bulgarianAmount");

const React = require("react");
const { Page, Text, View, Document, StyleSheet, Font } = require("@react-pdf/renderer");
const path = require("path");

const secret = process.env.UCN_SECRET_KEY;

// Register font
Font.register({
  family: "DejaVu",
  fonts: [
    {
      src: path.join(__dirname, "../fonts/DejaVuSans.ttf"), // normal weight
      fontWeight: "normal"
    },
    {
      src: path.join(__dirname, "../fonts/DejaVuSans-Bold.ttf"), // bold weight
      fontWeight: "bold"
    }
  ]
});

const styles = StyleSheet.create({
  page: { padding: 80, fontSize: 10, fontFamily: "DejaVu", lineHeight: 1.5 },
  title: { fontSize: 14, textAlign: "center", marginBottom: 10 },
  section: { marginBottom: 12 },
  bold: { fontFamily: "DejaVu", fontWeight: "bold" },
  carDescription: {
    marginBottom: 6,
    fontFamily: "DejaVu",
    fontSize: 10
  },

  signaturesRow: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  signatureBlock: {
    width: "45%"
  },
  signatureLabel: {
    marginBottom: 40 // space for actual signature
  },
  signatureName: {
    marginTop: 4
  }
});

function boldText(text) {
  return React.createElement(Text, { style: styles.bold }, text);
}

function ExtendedRegularContractPDF({ buyer, cars = [] }) {
  const totalAmount = cars.reduce(
    (sum, car) => sum + car.unit_price * (car.quantity || 1),
    0
  );
  const totalAmountWords = amountToBGWords(totalAmount);

  const today = new Date().toLocaleDateString("bg-BG");

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // Titles
      React.createElement(Text, { style: styles.title }, "ДОГОВОР"),
      React.createElement(
        Text,
        { style: styles.title },
        "за покупко - продажба на моторно превозно средство (МПС)"
      ),

      // Parties
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            "Днес, на ",
            boldText(`${today}`),
            " г. в гр. София между:"
          ),

          React.createElement(View, { style: { marginTop: 8 } }),

          React.createElement(
            Text,
            null,
            "I. ",
            boldText("„Некст Авто“ ЕООД"),
            ", ЕИК: 208224080, със седалище и адрес на управление в гр. Стара Загора, бул. „Темида“ 1, тел.: 0996600600, e-mail: sales@solaris.expert, представлявано от управителя Пламен Иванов Генчев, от една страна, като ",
            boldText("ПРОДАВАЧ"),
            " и от друга"
          ),

          buyer.customer_type === "Individual" &&
            React.createElement(
              Text,
              null,
              "II. ",
              boldText(`${buyer.display_name} с ЕГН: `),
              `${buyer.national_id || ""} с адрес: ${buyer.city || ""}, ${buyer.address_line || ""}, телефон: ${buyer.phone || ""}, наричан по-долу `,
              "– ",
              boldText("КУПУВАЧ")
            ),

          buyer.customer_type === "Company" &&
            React.createElement(
              Text,
              null,
              "II. ",
              boldText(`${buyer.display_name} с ЕИК: `),
              `${buyer.vat_number || ""}, с адрес на управление: ${buyer.city || ""}, ${buyer.address_line || ""}, представлявано от ${buyer.rep_first_name || ""} ${buyer.rep_middle_name || ""} ${buyer.rep_last_name || ""}, наричан по-долу `,
              "– ",
              boldText("КУПУВАЧ")
            )
        ]
      ),

      // Vehicle description
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            "се сключи настоящият договор за покупко-продажба на следните МПС:"
          ),

          React.createElement(
            View,
            { style: { marginTop: 6 } },
            cars.map((car, idx) =>
              React.createElement(
                Text,
                { key: idx, style: styles.carDescription },
                boldText("Лек автомобил"),
                `, марка/модел "`,
                React.createElement(
                  Text,
                  { style: styles.bold },
                  `${car.maker} ${car.model} ${car.edition || ""}`
                ),
                `", Идентификационен номер на превозното средство с VIN № ${car.vin}, цвят: ${car.exterior_color || "неуточнен"} / ${car.interior_color || ""}, пробег на автомобила – ${car.mileage_km || 0} км, количество ${car.quantity || 1}, обща цена ${(
                  (car.unit_price || 0) * (car.quantity || 1)
                ).toLocaleString()} лв с ДДС (${amountToBGWords((car.unit_price || 0) * (car.quantity || 1))}).`
              )
            )
          ),

          React.createElement(
            Text,
            { style: { marginTop: 6 } },
            "на долуописаната цена и при следните условия:"
          )
        ]
      ),

      // Clauses 1–2 (price + payment)
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            boldText("Чл. 1. ПРОДАВАЧЪТ"),
            " продава на ",
            boldText("КУПУВАЧА"),
            " моторните превозни средства, описани по-горе, в такова състояние, в каквото се намират в момента на продажбата, заедно с всички принадлежности към тях, за сумата от ",
            `${totalAmount.toLocaleString()}`,
            ` лв с ДДС (${totalAmountWords}), която `,
            boldText("ПРОДАВАЧЪТ"),
            " ще получи напълно по банков път от ",
            boldText("КУПУВАЧА"),
            " при сключване на настоящия договор, на следната банкова сметка:"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 20 } },
            "IBAN сметка: BG66FINV91501017882794"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 20 } },
            "BIC код на банката: FINVBGSF"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 20 } },
            "Банка: Първа инвестиционна банка АД"
          ),

          React.createElement(View, { style: { marginTop: 6 } }),

          React.createElement(
            Text,
            null,
            boldText("Чл. 2. КУПУВАЧЪТ"),
            " заяви, че е съгласен и купува от ",
            boldText("ПРОДАВАЧА"),
            " описаното по-горе МПС, в техническото състояние, в което се намира, за сумата от ",
            `${totalAmount.toLocaleString()}`,
            ` лв с ДДС (${totalAmountWords}), която сума `,
            boldText("КУПУВАЧЪТ"),
            " заяви, че ще заплати по банков път при сключване на настоящия договор. Разноските по регистрацията са за сметка на купувача."
          )
        ]
      ),

      // Clause 3
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 3. ПРОДАВАЧЪТ"),
          " декларира, че автомобилът не е предмет на особен залог или обезпечение, върху него няма наложен запор, не е давано пълномощно за продажбата му на други лица и че не съществуват никакви пречки да бъде извършена продажбата."
        )
      ),

      // Clause 4
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 4. "),
          "Гаранцията на МПС тече от деня на регистрирането или предаване на вещта във владение на ",
          boldText("КУПУВАЧА"),
          " (което настъпи първо). Периодът, за който гаранцията ще покрие възникването на възможни производствени дефекти (авария/несъвършенства) е 5 г. и/или 150 000 км. (което настъпи първо). При настъпването на техническа неизправност на МПС, докато последното е в гаранционния срок, разходите по отстраняването (труд и материали) са за сметка на ",
          boldText("ПРОДАВАЧА"),
          "."
        )
      ),

      // Clause 5
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            boldText("Чл. 5. "),
            "Не се покриват гаранционно следните компоненти:"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("1. "),
            "светлинни крушки, всички покрития в интериора като мокети, тапицерии, стелки, пластмасови покрития, инструменти и аксесоари, придружаващи автомобила, инжектори, жила, спирачни дискове (барабани) и накладки, маркучи, тръбопроводи, гуми, предпазители, чистачки, свещи, батерии. Доливането вследствие нормална консумация на лубриканти, масло, греси, спирачна течност, антифриз, течност за чистачки, фреон вследствие нормалното експлоатиране на автомобила, както и всички стъкла на автомобила;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("2. "),
            "Масла, течности, ремъци, филтри и консумативи, които са част от периодичната поддръжка на автомобила;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("3. "),
            "тампони и втулки, шарнири (сферични връзки), кормилни накрайници и връзки, лагери, стабилизиращи щанги и връзки, биалетки, прахови уплътнения;"
          )
        ]
      ),

      // Clause 6
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            boldText("Чл. 6. "),
            "Гаранцията не се прилага при възникване на неизправност, вследствие на следните обстоятелства:"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("1. "),
            "Инциденти при транспортиране на автомобила;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("2. "),
            "Неправилна поддръжка и стопанисване на автомобила;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("3. "),
            "Предпродажбена проверка и рутинна поддръжка;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("4. "),
            "Инциденти, неправилна употреба, злоупотреба – увреждания и проблеми, вследствие на пътнотранспортни произшествия, неправилна употреба, неглижираност, тестове за изпитания, състезания, както и неправилно съхранение;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("5. "),
            "Неизправности, възникнали в резултат от модификации и интервенции – увреждания, причинени вследствие на извършени неоторизирани модификации, интервенции и промени не се покриват по гаранция;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("6. "),
            "Неизправности, възникнали в резултат от некоректна поддръжка – компоненти и труд, част от планираната поддръжка на автомобила, не се покриват по гаранция – масла, филтри, свещи, ремъци и др. консумативи. Също така не се покриват по гаранция регулировки, напасвания, почистване, калиброване, промиване, само инспекции, доливане на течности. Износване и скъсване вследствие експлоатацията на автомобила не се покрива по гаранция също;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("7. "),
            "Неизправности, възникнали в резултат от употреба на неоригинални части – възникването на неизправност в резултат от използването на неоригинални части и аксесоари не се покриват по гаранция. Евентуални последващи проблеми и щети, причинени от неоригинални части, също не се покриват гаранционно;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("8. "),
            "Не се покриват по гаранция проблеми, свързани с грешно гориво, лошо качество на горивото, използвани добавки за гориво. Ненавременното отстраняване на дефекти и проблеми, както и евентуални допълнителни увреждания вследствие това, не се покриват по гаранция. Проблеми и увреждания от инциденти, катастрофи, кражба, бунтове, протести, вандализъм, природни стихии, пожар и други форсмажорни обстоятелства не се покриват от гаранцията;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("9. "),
            "Гаранцията не покрива риска по погиване/увреждане на авточасти, достигнали до края на своя експлоатационен период."
          )
        ]
      ),

      // Clause 7
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 7. "),
          "Коли с увредени показатели за изминат пробег, несъответстващ такъв спрямо сервизната история или манипулиран, имат невалидна гаранция. Ако поради естеството на проблема е невъзможно да бъде отчетен пробегът на автомобила, то той ще бъде изчислен като 300 км на ден от датата на първа регистрация или последно известен и потвърден пробег."
        )
      ),

      // Clause 8
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 8. "),
          "Гаранцията възстановява разходите само и единствено по резервните части и труда, необходим за отремонтирането на автомобила. Всички допълнителни разходи по паркинг на автомобила, репатриране, пътни такси, телефонни такси, хотели, билети за транспорт, кола под наем, пропуснати ползи и време, както и всички останали непреки разходи не се покриват от гаранцията."
        )
      ),

      // Clause 9
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 9. "),
          "Гаранция против корозия на каросерията и покритието на боята е 24 месеца, считано от сключване на настоящия договор."
        )
      ),

      // Clause 10
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            boldText("Чл. 10. "),
            "Предходната разпоредба не намира приложение, при следните ситуации и условия:"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("1. "),
            "Механични увреждания – гаранцията не покрива корозия, която е възникнала по МПС в резултат от механични увреждания на каросерията, като удари, наранявания или други повреди;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("2. "),
            "Небрежност или лошо поддържане – в случай, че собственикът на автомобила не поддържа и не се грижи за каросерията съгласно указанията на производителя или не осигурява поддръжка, гаранцията става невалидна;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("3. "),
            "Модификации и промени – ако автомобилът е претърпял модификации или промени в каросерията след покупката, които не са били одобрени от производителя, гаранцията става невалидна;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("4. "),
            "Агресивни условия на околната среда – гаранцията не покрива корозия, която е възникнала върху МПС в резултат от агресивни условия на околната среда, като излагане на автомобила на силни химикали, сол, киселинни дъждове или други агресивни фактори, както и използването на автомобила на агресивни терени;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("5. "),
            "Гаранцията не покрива щети по каросерията и покритието на боята, предизвикани от умишлени или неправомерни действия."
          )
        ]
      ),

      // Clause 11
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 11. "),
          "Гаранционните условия за автомобили, използвани за специфични комерсиални цели, като таксиметрови превози, под наем (Rent a car), полиция, пожарна, линейки, аварийни служби и други специализирани сфери, са намалени спрямо стандартните гаранционни условия за леки автомобили. Гаранционният период за такива автомобили е 24 месеца или 100 000 километра."
        )
      ),

      // Clause 12
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 12. "),
          "В случаи, в които се касае за МПС, използвани за специфични комерсиални цели, като таксиметрови превози, под наем (Rent a car), полиция, пожарна, линейки, аварийни служби и други специализирани сфери, гаранцията за всички останали компоненти, които са изброени в таблицата с гаранционни компоненти, се намалява до 1/2 от стандартния гаранционен срок."
        )
      ),

      // Clause 13
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            boldText("Чл. 13. "),
            "Части с различен гаранционен срок:"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("1. "),
            "Компоненти на ходовата част – покритието за тези части е 24 месеца или 50 000 км. (което от двете настъпи първо);"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("2. "),
            "Аудиосистема и система за комфорт и управление – покритието на тези системи е 36 месеца или 60 000 км. (което от двете настъпи първо). Гаранцията на тези системи обхваща следните компоненти: говорители, тонколони, усилвател, мултимедийна система, радиоприемник, дисплей на арматурното табло, микрофони, навигационна система, всички видове бутони и управления в интериора на автомобила. Гаранцията не покрива дефекти, произтичащи от външна намеса или неправилна употреба;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("3. "),
            "Горивна система – покритието на тази система е 24 месеца или 50 000 км. (което от двете настъпи първо). Гаранцията на горивната система обхваща следните компоненти: горивна помпа, инжектори и горивна рейка. Гаранцията не покрива дефекти, произтичащи от външна намеса или неправилна употреба, както и уплътненията, горивопроводи или използването на грешно гориво;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("4. "),
            "Климатична и охладителна система – покритието на тези системи е 24 месеца или 50 000 км. (което от двете настъпи първо). Гаранцията на тези системи обхваща следните компоненти: климатичен компресор, радиатори, изпарител, кондензатор, водна помпа, термостат, сензори за температура и вентилатори;"
          ),
          React.createElement(
            Text,
            { style: { marginLeft: 15 } },
            boldText("5. "),
            "Изпускателна система – покритието на изпускателната система е 36 месеца или 100 000 км. (което от двете настъпи първо). Гаранцията на изпускателната система обхваща следните компоненти: изпускателен колектор, катализатор, гърнета, тръби на изпускателната система и турбокомпресор."
          )
        ]
      ),

      // Clause 14
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 14. "),
          "Гаранцията не покрива дефекти, произтичащи от външна намеса, неправилна употреба или повреди, причинени от използване на неправилно гориво. Също така, гаранцията не важи за компоненти, повредени вследствие на корозия, механични удари или други външни фактори."
        )
      ),

      // Clause 15
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 15. "),
          "Цялостната гаранция на автомобила важи само на територията на Република България."
        )
      ),

      // Clause 16
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 16. "),
          "В случай че регистрирането на автомобила в съответното звено на МВР (КАТ) бъде възпрепятствано поради несъответствия в документите, технически пречки или други обективни обстоятелства, непреодолими от страна на ",
          boldText("КУПУВАЧА"),
          ", настоящият договор подлежи на разваляне. В този случай ",
          boldText("ПРОДАВАЧЪТ"),
          " е длъжен да възстанови на ",
          boldText("КУПУВАЧА"),
          " изцяло получената сума. Възстановяването на сумата следва да бъде извършено от страна на ",
          boldText("ПРОДАВАЧА"),
          " спрямо ",
          boldText("КУПУВАЧА"),
          ", в 5-дневен срок, считано от получаване на писмено уведомление за това обстоятелство."
        )
      ),

      // Clause 17
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 17. "),
          "При възникване на проблем с автомобила в рамките на гаранционния срок, ",
          boldText("КУПУВАЧЪТ"),
          " е длъжен незабавно да уведоми ",
          boldText("ПРОДАВАЧА"),
          ", като предостави информация за характера на повредата, ако е известна. След уведомлението, ",
          boldText("ПРОДАВАЧЪТ"),
          " организира консултация с външна експертна фирма относно конкретния случай. На база направената оценка, ",
          boldText("ПРОДАВАЧЪТ"),
          " определя подходящ сервиз, в който да бъде извършен ремонт на автомобила, и своевременно уведомява ",
          boldText("КУПУВАЧА"),
          " за избрания сервиз и го насочва към него за извършване на гаранционното обслужване."
        )
      ),

      // Clause 18
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          boldText("Чл. 18. "),
          "В случай, че необходимият гаранционен ремонт на автомобила трае повече от 5 (пет) работни дни, ",
          boldText("ПРОДАВАЧЪТ"),
          " се задължава да предостави на ",
          boldText("КУПУВАЧА"),
          " заместващ автомобил от същия или сходен клас за времето на ремонта, без допълнително заплащане."
        )
      ),

      // Clauses 19–21
      React.createElement(
        View,
        { style: styles.section },
        [
          React.createElement(
            Text,
            null,
            boldText("Чл. 19. "),
            "Страните ще решават споровете, възникнали по повод изпълнението на настоящия договор, с разбирателство и взаимни отстъпки."
          ),
          React.createElement(
            Text,
            null,
            boldText("Чл. 20. "),
            "За неуредените с този договор въпроси се прилагат разпоредбите на гражданското законодателство на Република България."
          ),
          React.createElement(
            Text,
            null,
            boldText("Чл. 21. "),
            "Настоящият договор се състави в два еднакви екземпляра – по един за всяка от страните."
          )
        ]
      ),

      // “4.” sentence from your template (kept as-is)
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          null,
          "Настоящият договор може да бъде изменян или допълван от страните с отделно писмено споразумение, облечено в писмена форма."
        )
      ),

      // Signatures - seller left, buyer right
React.createElement(
  View,
  { style: styles.signaturesRow },
  [
    // Seller (left)
    React.createElement(
      View,
      { style: styles.signatureBlock },
      [
        React.createElement(
          Text,
          { style: styles.signatureLabel },
          "ПРОДАВАЧ: ..................................."
        ),
        React.createElement(
          Text,
          { style: styles.signatureName },
          "/ Пламен Генчев /"
        )
      ]
    ),

    // Buyer (right)
    React.createElement(
      View,
      { style: [styles.signatureBlock, { alignItems: "flex-end" }] },
      [
        React.createElement(
          Text,
          { style: styles.signatureLabel },
          "КУПУВАЧ: ..................................."
        ),
        buyer.customer_type === "Company" &&
          React.createElement(
            Text,
            { style: styles.signatureName },
            "/ ",
            `${buyer.rep_first_name || ""} ${buyer.rep_last_name || ""}`,
            " /"
          ),
        buyer.customer_type === "Individual" &&
          React.createElement(
            Text,
            { style: styles.signatureName },
            "/ ",
            `${buyer.first_name || ""} ${buyer.last_name || ""}`,
            " /"
          )
      ]
    )
  ]
)

    )
  );
}

module.exports = ExtendedRegularContractPDF;
