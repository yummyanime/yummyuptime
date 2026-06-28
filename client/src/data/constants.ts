export const countries = [
    { code: "RU", name: "Россия" },
    { code: "UA", name: "Украина" },
    { code: "KZ", name: "Казахстан" },
    { code: "BY", name: "Беларусь" },
    { code: "DE", name: "Германия" },
    { code: "KG", name: "Кыргызстан" },
    { code: "PL", name: "Польша" },
    { code: "LV", name: "Латвия" },
    { code: "LT", name: "Литва" },
    { code: "EE", name: "Эстония" },
    { code: "US", name: "США" },
    { code: "NL", name: "Нидерланды" },
    { code: "GB", name: "Великобритания" },
    { code: "MD", name: "Молдова" },
    { code: "CZ", name: "Чехия" },
    { code: "GE", name: "Грузия" },
    { code: "AM", name: "Армения" },
];

export const domainGroups = [
    {
        title: "Старый сайт",
        domains: [
            { value: "old.yummyani.me", label: "old.yummyani.me" },
            { value: "old.yummy-ani.me", label: "old.yummy-ani.me" },
        ],
    },
    {
        title: "Новый сайт",
        domains: [
            { value: "ru.yummyani.me", label: "new.yummyani.me" },
            { value: "ru.yummy-ani.me", label: "new.yummy-ani.me" },
        ],
    },
    {
        title: "Служебные сервисы",
        domains: [{ value: "api.yani.tv", label: "API" }],
    },
];

export const domains = domainGroups.flatMap((group) =>
    group.domains.map((entry) => entry.value)
);

const domainLabelMap: { [value: string]: string } = Object.fromEntries(
    domainGroups.flatMap((group) =>
        group.domains.map((entry) => [entry.value, entry.label])
    )
);

export const getDomainLabel = (value: string): string =>
    domainLabelMap[value] ?? value;

export const cityTranslations: { [key: string]: string } = {
    Moscow: "Москва",
    "Saint Petersburg": "Санкт-Петербург",
    Kyiv: "Киев",
    Lviv: "Львов",
    Odesa: "Одесса",
    Almaty: "Алматы",
    Minsk: "Минск",
    Berlin: "Берлин",
    Dusseldorf: "Дюссельдорф",
    Bishkek: "Бишкек",
    Warsaw: "Варшава",
    Krakow: "Краков",
    Riga: "Рига",
    Vilnius: "Вильнюс",
    Siauliai: "Шяуляй",
    Tallinn: "Таллин",
    "New York": "Нью-Йорк",
    "Los Angeles": "Лос-Анджелес",
    Amsterdam: "Амстердам",
    Utrecht: "Утрехт",
    London: "Лондон",
    Chisinau: "Кишинёв",
    Prague: "Прага",
    Brno: "Брно",
    Tbilisi: "Тбилиси",
    Yerevan: "Ереван",
    Novosibirsk: "Новосибирск",
    Aktau: "Актау",
};

export const PROBE_ERROR_CODE = 900;
export const SLOW_RESPONSE_MS = 1500;
export const CHART_SPIKE_MS = 2500;
export const DOWNTIME_ERROR_CODES = new Set([902, 908]);

export const isProbeNoise = (statusCode: number | null | undefined): boolean =>
    Number(statusCode) >= PROBE_ERROR_CODE &&
    !DOWNTIME_ERROR_CODES.has(Number(statusCode));

export const isRelevantStatus = (statusCode: number | null | undefined): boolean =>
    !isProbeNoise(statusCode);

export const CHART_COLORS = [
    "#ff6666",
    "#36a2eb",
    "#ffce56",
    "#4bc0c0",
    "#9966ff",
    "#ff9f40",
    "#E7E9ED",
    "#A8D08D", 
    "#C08497", 
    "#9D7CA0", 
    "#7EC0EE", 
]
