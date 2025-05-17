const path = require('path');

module.exports = {
    webpack: {
        alias: {
            '@': path.resolve(__dirname, 'src/') // '@' が 'src' ディレクトリを指すように設定
          },
        // configure: (webpackConfig, { env, paths }) => {
        //   // 他に webpack の設定変更があればここに残します
        //   return webpackConfig;
        // },
  },
};