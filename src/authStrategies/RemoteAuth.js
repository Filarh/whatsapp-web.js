'use strict';

const fs = require('fs-extra');
const unzipper = require('unzipper');
const archiver = require('archiver');
const path = require('path');
const { Events } = require('./../util/Constants');
const BaseAuthStrategy = require('./BaseAuthStrategy');

/**
 * Remote-based authentication with compressed session and optional cleanup
 */
class RemoteAuth extends BaseAuthStrategy {
  constructor({ clientId, dataPath, store, backupSyncIntervalMs, rmMaxRetries } = {}) {
    super();

    if (!store) throw new Error('Remote database store is required.');
    if (!backupSyncIntervalMs || backupSyncIntervalMs < 60000) {
      throw new Error('Invalid backupSyncIntervalMs. Must be >= 60000 ms');
    }

    this.store = store;
    this.clientId = clientId;
    this.backupSyncIntervalMs = backupSyncIntervalMs;
    this.dataPath = path.resolve(dataPath || './.wwebjs_auth/');
    this.tempDir = `${this.dataPath}/wwebjs_temp_session_${this.clientId}`;
    this.rmMaxRetries = rmMaxRetries ?? 4;
  }

  async beforeBrowserInitialized() {
    const puppeteerOpts = this.client.options.puppeteer;
    const sessionDirName = this.clientId ? `RemoteAuth-${this.clientId}` : 'RemoteAuth';
    const dirPath = path.join(this.dataPath, sessionDirName);

    if (puppeteerOpts.userDataDir && puppeteerOpts.userDataDir !== dirPath) {
      throw new Error('RemoteAuth is not compatible with a user-supplied userDataDir.');
    }

    this.userDataDir = dirPath;
    this.sessionName = sessionDirName;

    await this.extractRemoteSession();

    this.client.options.puppeteer = {
      ...puppeteerOpts,
      userDataDir: dirPath
    };
  }

  async logout() {
    await this.disconnect();
  }

  async destroy() {
    clearInterval(this.backupSync);
  }

  async disconnect() {
    await this.deleteRemoteSession();
    const exists = await this.isValidPath(this.userDataDir);
    if (exists) {
      await fs.promises.rm(this.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: this.rmMaxRetries
      }).catch(() => {});
    }
    clearInterval(this.backupSync);
  }

  async afterAuthReady() {
    const exists = await this.store.sessionExists({ session: this.sessionName });
    if (!exists) {
      await this.delay(60000);
      await this.storeRemoteSession({ emit: true });
    }

    this.backupSync = setInterval(async () => {
      await this.storeRemoteSession();
    }, this.backupSyncIntervalMs);
  }

  async storeRemoteSession(options) {
    const exists = await this.isValidPath(this.userDataDir);
    if (exists) {
      await this.compressSession();
      await this.store.save({ session: this.sessionName });
      await fs.promises.unlink(`${this.sessionName}.zip`).catch(() => {});
      await fs.promises.rm(this.tempDir, {
        recursive: true,
        force: true,
        maxRetries: this.rmMaxRetries
      }).catch(() => {});
      if (options?.emit) this.client.emit(Events.REMOTE_SESSION_SAVED);
    }
  }

  async extractRemoteSession() {
    const pathExists = await this.isValidPath(this.userDataDir);
    const zipPath = `${this.sessionName}.zip`;
    const exists = await this.store.sessionExists({ session: this.sessionName });

    if (pathExists) {
      await fs.promises.rm(this.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: this.rmMaxRetries
      }).catch(() => {});
    }

    if (exists) {
      await this.store.extract({ session: this.sessionName, path: zipPath });
      await this.unCompressSession(zipPath);
    } else {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
  }

  async deleteRemoteSession() {
    const exists = await this.store.sessionExists({ session: this.sessionName });
    if (exists) await this.store.delete({ session: this.sessionName });
  }

  async compressSession() {
    const archive = archiver('zip');
    const stream = fs.createWriteStream(`${this.sessionName}.zip`);

    await fs.copy(this.userDataDir, this.tempDir).catch(() => {});
    await this.deleteMetadata(); // limpia antes de comprimir

    return new Promise((resolve, reject) => {
      archive
        .directory(this.tempDir, false)
        .on('error', err => reject(err))
        .pipe(stream);

      stream.on('close', () => resolve());
      archive.finalize();
    });
  }

  async unCompressSession(zipPath) {
    const stream = fs.createReadStream(zipPath);
    await new Promise((resolve, reject) => {
      stream
        .pipe(unzipper.Extract({ path: this.userDataDir }))
        .on('error', err => reject(err))
        .on('finish', () => resolve());
    });
    await fs.promises.unlink(zipPath).catch(() => {});
  }

  async deleteMetadata() {
    const keep = [
      'IndexedDB',
      'Local Storage',
      'Session Storage',
      'blob_storage',
      'databases',
      'shared_proto_db',
      'VideoDecodeStats'
    ];
    const dirs = [this.tempDir, path.join(this.tempDir, 'Default')];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = await fs.promises.readdir(dir);
      for (const file of files) {
        if (!keep.includes(file)) {
          const full = path.join(dir, file);
          const stats = await fs.promises.lstat(full);
          if (stats.isDirectory()) {
            await fs.promises.rm(full, {
              recursive: true,
              force: true,
              maxRetries: this.rmMaxRetries
            }).catch(() => {});
          } else {
            await fs.promises.unlink(full).catch(() => {});
          }
        }
      }
    }
  }

  async isValidPath(p) {
    try {
      await fs.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RemoteAuth;
