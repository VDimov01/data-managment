function translateStatus(status) {
    switch (status) {
        case 'draft':
            return 'Чернова';
        case 'issued':
            return 'Издаден';
        case 'viewed':
            return 'Прегледан';
        case 'signed':
            return 'Подписан';
        case 'withdrawn':
            return 'Отворен';
        case 'expired':
            return 'Изтекъл';
        default:
            return 'Непознат';
    }
}

function translateAllowedPaymentMethods(methods) {
    //methods is an array do it for an array
    let result = '';
    methods.forEach(method => {
        switch (method) {
            case 'cash':
                result += 'В брой ';
                break;
            case 'bank_transfer':
                result += 'Банков превод ';
                break;
        case 'card':
                result += 'Кредитна карта ';
                break;
        case 'invoice':
                result += 'Фактура ';
                break;
        case 'other':
                result += 'Друго ';
                break;
        default:
            return 'Непознат';
    }
    });
    return result;
}

module.exports = {
    translateStatus,
    translateAllowedPaymentMethods
}