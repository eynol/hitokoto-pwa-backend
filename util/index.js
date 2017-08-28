const MAP = "1234567890qwertyuopasdfghjkzxcvbnm".toUpperCase().split(''); // 'i' and 'l' are not included;

/**
 * 生成大写的邮箱验证码，没有i和l
 *
 * @returns {String}
 */
exports.generateCode4 = function () {
  return [1, 2, 3, 4].map(() => MAP[Math.floor(Math.random() * MAP.length)]).join('');
}
