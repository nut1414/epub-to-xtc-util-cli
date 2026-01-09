var DEVICE_SPECS = {
    x4: {
        name: 'Xteink X4',
        width: 480,
        height: 800
    },
    x3: {
        name: 'Xteink X3',
        width: 528,
        height: 792
    }
};

var GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)', // Purple/Magenta
    'linear-gradient(135deg, #5896ec 0%, #5b73c8 50%, #7ac4e9 100%)', // Purple/Blue blend
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 50%, #43e97b 100%)', // Blue/Cyan/Green
    'linear-gradient(135deg, #74ab88 0%, #78ec8f 50%, #3ab99b 100%)', // Green/Teal blend
    'linear-gradient(135deg, #fa709a 0%, #fee140 50%, #30cfd0 100%)', // Pink/Yellow/Cyan
    'linear-gradient(135deg, #d18ab2 0%, #fee19b 50%, #7dd5da 100%)', // Soft warm blend
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 50%, #fbc2eb 100%)', // Soft Pastels
    'linear-gradient(135deg, #8898eb 0%, #b89bc2 50%, #f8b0ed 100%)', // Lavender/Pink blend
    'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)', // Magenta/Coral/Blue
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 50%, #667eea 100%)', // Green/Turquoise/Purple
    'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 50%, #2bff88 100%)', // Neon Pink/Cyan/Green
    'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 50%, #c2e9fb 100%)', // Pastel Pink/Lavender/Blue
    'linear-gradient(135deg, #fddb92 0%, #d1fdff 50%, #a8edea 100%)', // Yellow/Mint/Aqua
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fbc2eb 100%)', // Coral/Pink/Lavender
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #ff8177 100%)', // Peach/Coral/Orange
    'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 50%, #e0c3fc 100%)', // Sky Blue/Aqua/Lavender
    'linear-gradient(135deg, #d299c2 0%, #fef9d7 50%, #a1c4fd 100%)', // Mauve/Cream/Sky
    'linear-gradient(135deg, #89f7fe 0%, #66a6ff 50%, #667eea 100%)', // Cyan/Blue/Purple
    'linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 50%, #fab1a0 100%)', // Soft Yellow/Orange/Peach
    'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 50%, #fbc2eb 100%)', // Neon Pink/Cyan/Pastel
];

var FONT_FAMILIES = {
    'Literata': {
        variants: [
            { file: 'Literata-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf' },
            { file: 'Literata-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/literata/Literata-Italic%5Bopsz%2Cwght%5D.ttf' }
        ],
        isVariable: true
    },
    'Lora': {
        variants: [
            { file: 'Lora-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lora/Lora%5Bwght%5D.ttf' },
            { file: 'Lora-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lora/Lora-Italic%5Bwght%5D.ttf' }
        ],
        isVariable: true
    },
    'Merriweather': {
        variants: [
            { file: 'Merriweather-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-Regular.ttf' },
            { file: 'Merriweather-Bold.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-Bold.ttf' },
            { file: 'Merriweather-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-Italic.ttf' },
            { file: 'Merriweather-BoldItalic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-BoldItalic.ttf' }
        ]
    },
    'Open Sans': {
        variants: [
            { file: 'OpenSans-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf' },
            { file: 'OpenSans-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/opensans/OpenSans-Italic%5Bwdth%2Cwght%5D.ttf' }
        ],
        isVariable: true
    },
    'Source Serif 4': {
        variants: [
            { file: 'SourceSerif4-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf' },
            { file: 'SourceSerif4-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sourceserif4/SourceSerif4-Italic%5Bopsz%2Cwght%5D.ttf' }
        ],
        isVariable: true
    },
    'Noto Sans': {
        variants: [
            { file: 'NotoSans-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf' },
            { file: 'NotoSans-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans-Italic%5Bwdth%2Cwght%5D.ttf' }
        ],
        isVariable: true
    },
    'Noto Serif': {
        variants: [
            { file: 'NotoSerif-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf' },
            { file: 'NotoSerif-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserif/NotoSerif-Italic%5Bwdth%2Cwght%5D.ttf' }
        ],
        isVariable: true
    },
    'Roboto': {
        variants: [
            { file: 'Roboto-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf' },
            { file: 'Roboto-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Italic%5Bwdth%2Cwght%5D.ttf' }
        ],
        isVariable: true
    },
    'EB Garamond': {
        variants: [
            { file: 'EBGaramond-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf' },
            { file: 'EBGaramond-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf' }
        ],
        isVariable: true
    },
    'Crimson Pro': {
        variants: [
            { file: 'CrimsonPro-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/crimsonpro/CrimsonPro%5Bwght%5D.ttf' },
            { file: 'CrimsonPro-Italic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/crimsonpro/CrimsonPro-Italic%5Bwght%5D.ttf' }
        ],
        isVariable: true
    }
};

var ARABIC_FONTS = [
    { file: 'NotoNaskhArabic-Regular.ttf', url: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf' },
    { file: 'NotoNaskhArabic-Medium.ttf', url: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Medium.ttf' },
    { file: 'NotoNaskhArabic-SemiBold.ttf', url: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-SemiBold.ttf' },
    { file: 'NotoNaskhArabic-Bold.ttf', url: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Bold.ttf' },
];

var LANG_TO_PATTERN = {
    'hy': 'Armenian.pattern',
    'eu': 'Basque.pattern',
    'bg': 'Bulgarian.pattern',
    'ca': 'Catalan.pattern',
    'cs': 'Czech.pattern',
    'da': 'Danish.pattern',
    'nl': 'Dutch.pattern',
    'en-gb': 'English_GB.pattern',
    'en': 'English_US.pattern',
    'eo': 'Esperanto.pattern',
    'et': 'Estonian.pattern',
    'fi': 'Finnish.pattern',
    'fr': 'French.pattern',
    'fur': 'Friulian.pattern',
    'gl': 'Galician.pattern',
    'ka': 'Georgian.pattern',
    'de': 'German.pattern',
    'el': 'Greek.pattern',
    'hr': 'Croatian.pattern',
    'hu': 'Hungarian.pattern',
    'is': 'Icelandic.pattern',
    'ga': 'Irish.pattern',
    'it': 'Italian.pattern',
    'la': 'Latin.pattern',
    'lv': 'Latvian.pattern',
    'lt': 'Lithuanian.pattern',
    'mk': 'Macedonian.pattern',
    'no': 'Norwegian.pattern',
    'oc': 'Occitan.pattern',
    'pms': 'Piedmontese.pattern',
    'pl': 'Polish.pattern',
    'pt-br': 'Portuguese_BR.pattern',
    'pt': 'Portuguese.pattern',
    'ro': 'Romanian.pattern',
    'rm': 'Romansh.pattern',
    'ru': 'Russian.pattern',
    'sr': 'Serbian.pattern',
    'sk': 'Slovak.pattern',
    'sl': 'Slovenian.pattern',
    'es': 'Spanish.pattern',
    'sv': 'Swedish.pattern',
    'tr': 'Turkish.pattern',
    'uk': 'Ukrainian.pattern',
    'cy': 'Welsh.pattern',
    'zu': 'Zulu.pattern'
};
