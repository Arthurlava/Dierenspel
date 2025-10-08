// src/animals.js
export const ANIMALS = new Set([
    "aap", "adelaar", "albatros", "alligator", "anaconda", "arend",
    "bever", "bizon", "bok", "buffel",
    "cheetah", "chinchilla", "chimp", "cobra", "coyote", "cavia",
    "dolfijn", "duif", "dromedaris", "das",
    "eend", "ekster", "eland", "ezel", "eekhoorn",
    "flamingo", "fret", "forel",
    "gans", "giraffe", "gorilla", "goudvis",
    "haai", "hamster", "hert", "hyena", "haas", "havik",
    "ijsvogel", "iguana",
    "jaguar", "jak",
    "kameel", "kanarie", "karper", "kat", "kievit", "kip", "koala", "konijn", "koolmees", "krokodil", "koe",
    "leeuw", "leguaan", "lemur", "luipaard", "luiaard", "lynx", "libel",
    "maki", "marmot", "meeuw", "mol", "muis", "mus",
    "nandoe", "neushoorn",
    "octopus", "ooievaar", "olifant", "otter", "orka", "oehoe",
    "panda", "panter", "papegaai", "parkiet", "paard", "pauw", "pinguïn", "poema",
    "rat", "raaf", "ree", "rendier", "rietgans", "rund",
    "salamander", "schaap", "schildpad", "schorpioen", "slang", "specht", "springbok", "struisvogel", "sneeuwuil",
    "tapir", "tijger", "tonijn", "toekan", "tortelduif",
    "uil", "urial",
    "valk", "varaan", "varken", "vis", "vleermuis", "vos",
    "walrus", "wasbeer", "wezel", "wolf",
    "yak",
    "zalm", "zebra", "zeehond", "zeeleeuw", "zeeschildpad", "zwaan"
]);

export const isKnownAnimal = w => ANIMALS.has((w ?? "").toLowerCase());
