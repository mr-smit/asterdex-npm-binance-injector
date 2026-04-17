'use strict';

/**
 * AsterDEX injector — monkey-patches the "binance" npm package at runtime.
 *
 * Must be required BEFORE any `require('binance')` call:
 *
 *   require('./asterdex-injector');
 *   const { USDMClient, WebsocketClient } = require('binance');
 *
 * Pass credentials as:
 *   new USDMClient({ user, signer, privateKey })
 *
 * Nothing in node_modules is modified on disk.
 */

const { ethers } = require('ethers');

// ─── EIP-712 constants ────────────────────────────────────────────────────────

const EIP712_DOMAIN = {
    name: 'AsterSignTransaction',
    version: '1',
    chainId: 1666,
    verifyingContract: '0x0000000000000000000000000000000000000000',
};
const EIP712_TYPES = { Message: [{ name: 'msg', type: 'string' }] };

async function signEIP712(urlEncodedParams, privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, { msg: urlEncodedParams });
}

// ─── Patch 1: requestUtils ────────────────────────────────────────────────────

const ru = require('binance/lib/util/requestUtils');

// save originals
const _origGetRESTRequestSignature = ru.getRESTRequestSignature;
const _origGetServerTimeEndpoint   = ru.getServerTimeEndpoint;
const _origGetRestBaseUrl          = ru.getRestBaseUrl;

// Replace signing: use EIP-712 when options.user/signer/privateKey are set
ru.getRESTRequestSignature = async function(data, options, key, secret, timestamp) {
    if (options && options.user && options.signer && options.privateKey) {
        const nonce = String(Date.now() * 1000); // microseconds
        const requestParams = Object.assign({}, data, {
            nonce,
            user:   options.user,
            signer: options.signer,
        });
        const serialisedParams = ru.serialiseParams(
            requestParams,
            options.strictParamValidation,
            true, // encodeValues
            options.filterUndefinedParams,
        );
        const signature = await signEIP712(serialisedParams, options.privateKey);
        return {
            requestBody:     Object.assign({}, data),
            serialisedParams,
            timestamp:       nonce,
            signature,
            recvWindow:      undefined,
        };
    }
    return _origGetRESTRequestSignature(data, options, key, secret, timestamp);
};

// Server time endpoint: usdm → v3
ru.getServerTimeEndpoint = function(urlKey) {
    if (urlKey === 'usdm' || urlKey === 'usdmtest') return 'fapi/v3/time';
    return _origGetServerTimeEndpoint(urlKey);
};

// Base REST URL: usdm → AsterDEX
ru.getRestBaseUrl = function(clientType, restClientOptions) {
    if (restClientOptions && restClientOptions.baseUrl) {
        return restClientOptions.baseUrl;
    }
    const key = (restClientOptions && restClientOptions.baseUrlKey) || clientType;
    if (key === 'usdm' || key === 'usdmtest') return 'https://fapi.asterdex.com';
    return _origGetRestBaseUrl(clientType, restClientOptions);
};

// ─── Patch 2: BaseRestClient prototype ───────────────────────────────────────

const BaseRestClient = require('binance/lib/util/BaseRestClient').default;
const _origCall = BaseRestClient.prototype._call;

BaseRestClient.prototype._call = function(method, endpoint, params, isPrivate, baseUrlOverride) {
    // Path rewrite: fapi/v1/ and fapi/v2/ → fapi/v3/ for AsterDEX
    const patchedEndpoint = endpoint.replace(/^fapi\/v[12]\//, 'fapi/v3/');

    // If AsterDEX credentials are present, bypass the key/secret auth check
    // by temporarily setting dummy values (our patched getRESTRequestSignature
    // detects options.user and uses EIP-712 instead of HMAC)
    if (isPrivate && this.options.user && this.options.signer && this.options.privateKey) {
        if (!this.key) {
            this.key    = '__aster__';
            this.secret = '__aster__';
        }
    }

    return _origCall.call(this, method, patchedEndpoint, params, isPrivate, baseUrlOverride);
};

// ─── Patch 3: USDMClient — listenKey needs auth (postPrivate/putPrivate/deletePrivate) ──

const { USDMClient } = require('binance/lib/usdm-client');

USDMClient.prototype.getFuturesUserDataListenKey = function() {
    return this.postPrivate('fapi/v3/listenKey');
};
USDMClient.prototype.keepAliveFuturesUserDataListenKey = function() {
    return this.putPrivate('fapi/v3/listenKey');
};
USDMClient.prototype.closeFuturesUserDataListenKey = function() {
    return this.deletePrivate('fapi/v3/listenKey');
};

// ─── Patch 4: WebSocket URLs ──────────────────────────────────────────────────

const wu = require('binance/lib/util/websockets/websocket-util');

const _origGetWsUrl       = wu.getWsUrl;
const _origGetWsURLSuffix = wu.getWsURLSuffix;

const ASTER_WS_KEYS = new Set([
    'usdm', 'usdmPublic', 'usdmMarket', 'usdmPrivate',
    'usdmTestnet', 'usdmTestnetPublic', 'usdmTestnetMarket', 'usdmTestnetPrivate',
]);

wu.getWsUrl = function(wsKey, wsClientOptions, logger) {
    if (wsClientOptions && wsClientOptions.wsUrl) return wsClientOptions.wsUrl;
    if (ASTER_WS_KEYS.has(wsKey)) return 'wss://fstream.asterdex.com';
    return _origGetWsUrl(wsKey, wsClientOptions, logger);
};

// usdmPrivate uses /private/stream?listenKey= on Binance → AsterDEX uses /ws/
wu.getWsURLSuffix = function(wsKey, connectionType) {
    if (wsKey === 'usdmPrivate' || wsKey === 'usdmTestnetPrivate') return '/ws/';
    return _origGetWsURLSuffix(wsKey, connectionType);
};

// ─── Patch 5: websocket-client.js subscribeEndpoint inline URL map ────────────
// The subscribeEndpoint() method has a hardcoded local object — patch it via
// the WebsocketClient prototype so the usdm entry points to AsterDEX.

const { WebsocketClient } = require('binance/lib/websocket-client');
const _origSubscribeEndpoint = WebsocketClient.prototype.subscribeEndpoint;

WebsocketClient.prototype.subscribeEndpoint = function(endpoint, market) {
    if (market === 'usdm') {
        const wsKey = require('binance/lib/util/websockets/websocket-util')
            .getLegacyWsStoreKeyWithContext(market, endpoint);
        return this.connect(wsKey, 'wss://fstream.asterdex.com' + `/ws/${endpoint}`);
    }
    return _origSubscribeEndpoint.call(this, endpoint, market);
};

// ─── Patch 6: websocket-client-legacy.js wsBaseEndpoints ─────────────────────
// The legacy client has a module-level const object — we patch the method that uses it.

try {
    const legacyMod = require('binance/lib/websocket-client-legacy');
    const LegacyWS  = legacyMod.WebsocketClientV1 || Object.values(legacyMod)[0];
    if (LegacyWS && LegacyWS.prototype && LegacyWS.prototype.getWsBaseUrl) {
        const _origLegacyGetWsBaseUrl = LegacyWS.prototype.getWsBaseUrl;
        LegacyWS.prototype.getWsBaseUrl = function(market, wsKey) {
            if (market === 'usdm') return 'wss://fstream.asterdex.com';
            return _origLegacyGetWsBaseUrl.call(this, market, wsKey);
        };
    }
} catch (_) {
    // legacy client optional
}


module.exports = {
    deriveSignerAddress: (privateKey) => new ethers.Wallet(privateKey).address,
};
