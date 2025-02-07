/* eslint-disable no-undef */
/// <reference types="./jssh" />

log.info('开始运行 HydroOJ 安装工具 / Starting HydroOJ installation tool');
let MINIO_ACCESS_KEY = randomstring(32);
let MINIO_SECRET_KEY = randomstring(32);
let DATABASE_PASSWORD = randomstring(32);

const source_nvm = `\
# load nvm env (by hydro installer)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`;

if (__arch !== 'amd64') log.fatal('不支持的架构 %s ,请尝试手动安装', __arch);
const china = (cli.prompt('此服务器是否位于中国大陆？(Y/n) ') || 'y').toLowerCase().trim() === 'y';
const NVM_NODEJS_ORG_MIRROR = china
    ? 'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release'
    : 'https://nodejs.org/dist';
const MONGODB_REPO = china
    ? 'https://mirrors.tuna.tsinghua.edu.cn/mongodb/apt/ubuntu'
    : 'https://repo.mongodb.org/apt/ubuntu';
const MINIO_DOWNLOAD = china
    ? 'http://dl.minio.org.cn/server/minio/release/linux-amd64/minio'
    : 'https://s3.undefined.moe/public/minio';
const SANDBOX_DOWNLOAD = china
    ? 'https://s3.undefined.moe/file/executor-amd64'
    : 'https://github.com/criyle/go-judge/releases/download/v1.1.8/executorserver-amd64';

if (!fs.exist('/etc/os-release')) log.fatal('/etc/os-release 文件未找到');
const osinfoFile = fs.readfile('/etc/os-release');
const lines = osinfoFile.split('\n');
const values = {};
for (const line of lines) {
    if (!line.trim()) continue;
    const d = line.split('=');
    if (d[1].startsWith('"')) values[d[0].toLowerCase()] = d[1].substr(1, d[1].length - 2);
    else values[d[0].toLowerCase()] = d[1];
}
if (!['ubuntu', 'arch'].includes(values.id)) log.fatal('不支持的系统');
const Arch = values.id === 'arch';

const steps = [
    {
        init: '正在初始化安装 / Preparing',
        operations: [
            'mkdir -p /data/db /data/file ~/.hydro',
            Arch ? 'pacman --needed --quiet --noconfirm -Sy' : 'apt-get -qq update',
            Arch ? 'pacman --needed --quiet --noconfirm -S gnupg curl' : 'apt-get install -y curl wget gnupg',
        ],
    },
    {
        init: '正在安装 MongoDB / Installing MongoDB',
        skip: () => fs.exist('/usr/bin/mongo'),
        operations: Arch
            ? [
                'curl -fSLO https://s3.undefined.moe/hydro/arch/libcurl-openssl-1.0-7.76.0-1-x86_64.pkg.tar.zst',
                'curl -fSLO https://s3.undefined.moe/hydro/arch/mongodb-bin-4.4.5-1-x86_64.pkg.tar.zst',
                'curl -fSLO https://s3.undefined.moe/hydro/arch/mongodb-tools-bin-100.3.1-1-x86_64.pkg.tar.zst',
                'pacman --noconfirm -U libcurl-openssl-1.0-7.76.0-1-x86_64.pkg.tar.zst'
                + 'mongodb-bin-4.4.5-1-x86_64.pkg.tar.zst mongodb-tools-bin-100.3.1-1-x86_64.pkg.tar.zst',
            ]
            : [
                () => {
                    fs.writefile(
                        '/etc/apt/sources.list.d/mongodb-org-4.4.list',
                        `deb [ arch=amd64 ] ${MONGODB_REPO} ${values.ubuntu_codename}/mongodb-org/4.4 multiverse`,
                    );
                },
                'wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add -',
                'apt-get -qq update',
                'apt-get -q install -y mongodb-org',
            ],
    },
    {
        init: '正在安装 NVM / Installing NVM',
        skip: () => {
            const nvm = fs.exist('/root/.nvm');
            const node = !exec('node -v').code;
            if (node && !nvm) log.fatal('检测到安装了 Node，但未使用 nvm 环境');
            return nvm;
        },
        operations: [
            () => {
                const resp = http.request('GET', 'https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.36.0/install.sh');
                const script = resp.body.replace(/raw\.githubusercontent\.com\/nvm-sh\/nvm\//g, 'cdn.jsdelivr.net/gh/nvm-sh/nvm@');
                fs.writefile('/tmp/install-nvm.sh', script);
            },
            'bash /tmp/install-nvm.sh',
        ],
    },
    {
        init: '正在安装 NodeJS / Installing NodeJS',
        operations: [
            () => {
                const res = exec1('bash -c "source /root/.nvm/nvm.sh && nvm install 14"', { NVM_NODEJS_ORG_MIRROR });
                const ver = res.output.split('Now using node v')[1].split(' ')[0];
                setenv('PATH', `/root/.nvm/versions/node/v${ver}/bin:${__env.PATH}`);
                const rc_path = `/root/.${__env['SHELL'].endsWith('zsh') ? 'zsh' : 'bash'}rc`;
                if (!fs.exist(rc_path)) fs.writefile(rc_path, source_nvm);
                else {
                    const rc_file = fs.readfile(rc_path);
                    if (!rc_file.includes(source_nvm)) fs.appendfile(rc_path, source_nvm);
                }
            },
            'npm i yarn -g',
        ],
    },
    {
        init: '正在安装 pm2 / Installing pm2',
        skip: () => fs.exist('/usr/local/bin/pm2'),
        operations: ['yarn global add pm2'],
    },
    {
        init: '正在创建数据库用户 / Creating database user',
        skip: () => fs.exist('/root/.hydro/config.json'),
        operations: [
            'pm2 start mongod',
            () => sleep(5000),
            () => fs.writefile('/tmp/createUser.js', `\
            db.createUser({
              user: 'hydro',
              pwd: '${DATABASE_PASSWORD}',
              roles: [{ role: 'readWrite', db: 'hydro' }]
            })`),
            'mongo 127.0.0.1:27017/hydro /tmp/createUser.js',
            () => fs.writefile('/root/.hydro/config.json', JSON.stringify({
                host: '127.0.0.1',
                port: 27017,
                name: 'hydro',
                username: 'hydro',
                password: DATABASE_PASSWORD,
            })),
            'pm2 stop mongod',
            'pm2 del mongod',
        ],
    },
    {
        init: '正在安装 MinIO / Installing MinIO',
        skip: () => fs.exist('/root/.hydro/env'),
        operations: [
            `curl -fSL ${MINIO_DOWNLOAD} -o /usr/bin/minio`,
            'chmod +x /usr/bin/minio',
            () => fs.writefile(
                '/root/.hydro/env',
                [`MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}`, `MINIO_SECRET_KEY=${MINIO_SECRET_KEY}`].join('\n'),
            ),
        ],
    },
    {
        init: '正在安装编译器 / Installing compiler',
        operations: [
            Arch ? 'pacman --needed --quiet --noconfirm -S gcc fpc' : 'apt-get install -y g++ fp-compiler >/dev/null',
        ],
    },
    {
        init: '正在安装 HydroOJ / Installing HydroOJ',
        operations: [
            'yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge',
            () => http.download(SANDBOX_DOWNLOAD, '/usr/bin/sandbox'),
            'chmod +x /usr/bin/sandbox',
            () => fs.writefile('/root/.hydro/addon.json', '["@hydrooj/ui-default","@hydrooj/hydrojudge"]'),
        ],
    },
    {
        init: '正在启动 / Starting',
        operations: [
            () => {
                [MINIO_ACCESS_KEY, MINIO_SECRET_KEY] = fs.readfile('/root/.hydro/env').split('\n').map((i) => i.split('=')[1]);
            },
            `pm2 start "MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY} MINIO_SECRET_KEY=${MINIO_SECRET_KEY} minio server /data/file" --name minio`,
            'pm2 start "mongod --auth --bind_ip 0.0.0.0" --name mongodb',
            () => sleep(1000),
            'pm2 start sandbox',
            'pm2 start hydrooj',
            'pm2 startup',
            'pm2 save',
        ],
    },
    {
        init: '安装完成 / Install done',
        operations: [
            () => {
                [MINIO_ACCESS_KEY, MINIO_SECRET_KEY] = fs.readfile('/root/.hydro/env').split('\n').map((i) => i.split('=')[1]);
                DATABASE_PASSWORD = loadconfig('/root/.hydro/config.json').password;
            },
            () => log.info('请重启终端并切换到 root 用户执行其他操作'),
            () => log.info('Please restart terminal and switch to root user to perform other operations'),
            () => log.info('数据库用户名：hydro / Database username: hydro'),
            () => log.info('数据库密码：%s / Database password: %s', DATABASE_PASSWORD, DATABASE_PASSWORD),
            () => log.info('MINIO_ACCESS_KEY=%s', MINIO_ACCESS_KEY),
            () => log.info('MINIO_SECRET_KEY=%s', MINIO_SECRET_KEY),
        ],
    },
];

for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    log.info(step.init);
    if (!(step.skip && step.skip())) {
        for (const op of step.operations) {
            if (typeof op === 'string') {
                exec(op);
                if (__code !== 0) log.fatal('Error when running %s', op);
            } else op();
        }
    } else log.info('已跳过该步骤 / Step skipped');
}

exit(0);
