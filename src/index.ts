import { serve, type HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    writeFileSync,
    rmSync,
    mkdirSync,
    appendFileSync,
    readFileSync,
} from 'fs';
import { inspect } from 'util';

const log = (...args: any) => {
    const data = `[${new Date().toISOString()}] ${args.join(' ')}`;
    console.log(data);
    appendFileSync('./log', data + '\n', { encoding: 'utf8' });
};

const pkgJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const application = `${pkgJson.name}@${pkgJson.version}`;

log(application, 'starting up...');

process.addListener('exit', (code) =>
    log(application, 'shutting down with code', code)
);

let TARGET_DIR = process.env.TARGET_DIR;
if (!TARGET_DIR) {
    TARGET_DIR = './tmp';
    log('setting TARGET_DIR to', TARGET_DIR);
    rmSync(TARGET_DIR, { recursive: true, force: true });
    mkdirSync(TARGET_DIR);
}

const app = new Hono<{ Bindings: HttpBindings }>();

app.use((c, next) => {
    const remoteAddress = c.env.incoming.socket.remoteAddress;
    log(
        c.req.method,
        c.req.path,
        remoteAddress || '',
        c.req.raw.headers.get('user-agent')
    );
    return next();
});
app.use(bodyLimit({ maxSize: 500 * 1024 * 1024 * 1024 }));

app.get('/', (c) => {
    return c.html(
        `<meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <form enctype='multipart/form-data' method='POST' action='upload'> 
        <input type='file' name='files[]' multiple>
        <button type='submit'>Submit</button>
    </form>`,
        200
    );
});

interface File {
    size: number;
    name: string;
    type: string;
    lastModified: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
}

app.post('/upload', async (c) => {
    const body = await c.req.parseBody();

    const files = body['files[]'] as unknown as File | File[];
    log(inspect(files, true, 3, true));
    if (Array.isArray(files)) {
        for (const file of files) {
            handleFile(file);
        }
    } else {
        handleFile(files);
    }
    return c.redirect('/');
});

const handleFile = async (file: File) => {
    log(`Writing ${file.name} with ${file.size} bytes`);
    writeFileSync(
        `${TARGET_DIR}/${file.name}`,
        Buffer.from(await file.arrayBuffer())
    );
};

const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 3000;
log(`${application} is running on port ${port}`);

serve({
    fetch: app.fetch,
    port,
});
