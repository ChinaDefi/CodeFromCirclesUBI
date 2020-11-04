// 创建用户账户

import CirclesCore from '@circles/core';
import Web3 from 'web3';

const web3 = new Web3();

// Initialize core
const core = new CirclesCore(web3, {
  // me: 从链上查  <合约>
  hubAddress: '0x..',
  proxyFactoryAddress: '0x..',
  safeMasterAddress: '0x..',

  // me: 从中心化的服务器查
  apiServiceEndpoint: 'https://..',
  graphNodeEndpoint: 'https://..',
  relayServiceEndpoint: 'https://..',
  subgraphName: '...',
});

// Create account    me: 创建账户  <合约>
const account = web3.eth.accounts.create();

/*
https://web3js.readthedocs.io/en/v1.2.0/web3-eth-accounts.html
生成具有私钥和公钥的帐户对象。
web3.eth.accounts.create();
> {
    address: "0xb8CE9ab6943e0eCED004cDe8e3bBed6568B2Fa01",
    privateKey: "0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709",
    signTransaction: function(tx){...},
    sign: function(data){...},
    encrypt: function(password){...}
}
*/

// Define nice username for us
const username = 'margareth';
const email = 'mgh@mail.org';

// Generate a nonce to predict Safe address
const nonce = new Date().getTime();

// Prepare Safe deployment and receive a predicted safeAddress   me: 准备安全部署并收到预测的safeAddress
const safeAddress = await core.safe.prepareDeploy(account, { nonce });

// Register username and connect it to Safe address
await core.user.register(account, {
  nonce,
  email,
  safeAddress,
  username,
});

//-------------创建账户 end

/**
     * Register a to-be-created Safe in the Relayer and receive a predicted
     * Safe address.
     *
     * @namespace core.safe.prepareDeploy
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {number} userOptions.nonce - nonce to predict address
     *
     * @return {string} - Predicted Gnosis Safe address
     */
    prepareDeploy: async (account, userOptions) => {
        checkAccount(web3, account);
  
        const options = checkOptions(userOptions, {
          nonce: {
            type: 'number',
          },
        });
  
        // Check if Safe already exists
        const predictedSafeAddress = await predictAddress(
          web3,
          utils,
          options.nonce,
          account.address,
        );
  
        // Return predicted Safe address when Safe is already in the system
        const status = await getSafeStatus(utils, predictedSafeAddress);
        if (status.isCreated) {
          return predictedSafeAddress;
        }
  
        // .. otherwise start creation of Safe  
        const { safe } = await utils.requestRelayer({
          path: ['safes'],
          version: 3,
          method: 'POST',
          data: {
            saltNonce: options.nonce,
            owners: [account.address],
            threshold: SAFE_THRESHOLD,
          },
        });
  
        return web3.utils.toChecksumAddress(safe);
      },



/**
 * Convenience wrapper function around checkOptions to check
 * for a valid web3 account.
 *
 * @access private
 *
 * @param {Web3} web3 - Web3 instance
 * @param {Object} account - web3 account instance
 *
 * @return {Object} - cleaned options
 */
export default function checkAccount(web3, account) {
    return checkOptions(account, {
      address: web3.utils.checkAddressChecksum, // 传入的是方法名
      privateKey: web3.utils.isHexStrict,  //方法名
    });
  }
  


  import CoreError, { ErrorCodes } from '~/common/error';

  const DEFAULT_TYPE = 'string';
  
  const validators = {
    boolean: (value) => {
      return typeof value === 'boolean';
    },
    number: (value) => {
      return typeof value === 'number';
    },
    string: (value) => {
      return typeof value === 'string';
    },
    object: (value) => {
      return typeof value === 'object';
    },
    array: (value) => {
      return Array.isArray(value);
    },
  };
  
  // Takes the validator function and wraps it safely around a try/catch block
  // before it gets executed
  function safelyValidate(validatorFn, value) {
    if (!(typeof validatorFn === 'function')) {
      throw Error('Validation for "checkOptions" has to be of type function');
    }
  
    try {
      return !!validatorFn(value);
    } catch {
      return false;
    }
  }
  
  /**
   * Check for required option fields, validate them and use fallback value when
   * default is given.
   *
   * @access private
   *
   * @param {Object} options - given user options
   * @param {Object} fields - defined option types and default values
   *
   * @return {Object} - cleaned options
   */
  export default function checkOptions(options, fields) {
    if (!options || typeof options !== 'object') {
      throw new CoreError('Options missing', ErrorCodes.INVALID_OPTIONS);
    }
  
    return Object.keys(fields).reduce((acc, key) => {
      const type =
        fields[key] && 'type' in fields[key] ? fields[key].type : DEFAULT_TYPE;
  
      const validatorFn = typeof type === 'function' ? type : validators[type];
  
      const defaultValue =
        fields[key] && 'default' in fields[key] ? fields[key].default : null;
  
      if (defaultValue !== null && !safelyValidate(validatorFn, defaultValue)) {
        throw new CoreError(
          `Field "${key}" has invalid default type`,
          ErrorCodes.INVALID_OPTIONS,
        );
      }
  
      if (!(key in options) || typeof options[key] === 'undefined') {
        if (defaultValue === null) {
          throw new CoreError(
            `"${key}" is missing in options`,
            ErrorCodes.INVALID_OPTIONS,
          );
        }
  
        acc[key] = defaultValue;
      } else if (safelyValidate(validatorFn, options[key])) {
        acc[key] = options[key];
      } else {
        throw new CoreError(
          `"${key}" has invalid type`,
          ErrorCodes.INVALID_OPTIONS,
        );
      }
  
      return acc;
    }, {});
  }
  


  /**
     * Send an API request to the Gnosis Relayer.
     *
     * @namespace core.utils.requestRelayer
     *
     * @param {Object} userOptions - request options
     * @param {string[]} userOptions.path - API path as array
     * @param {number} userOptions.version - API version 1 or 2
     * @param {string} userOptions.method - API request method (GET, POST)
     * @param {Object} userOptions.data - data payload
     */
    requestRelayer: async (userOptions) => {
        return requestRelayer(relayServiceEndpoint, userOptions);
      },
  

      async function requestRelayer(endpoint, userOptions) {
        const options = checkOptions(userOptions, {
          path: {
            type: 'array',
          },
          version: {
            type: 'number',
            default: 1,
          },
          method: {
            type: 'string',
            default: 'GET',
          },
          data: {
            type: 'object',
            default: {},
          },
        });
      
        const { path, method, data, version } = options;
      
        return request(endpoint, {
          path: ['api', `v${version}`].concat(path),
          method,
          data,
        });
      }



/**
     * Register a new username and email address and connect it to a Safe address.
     *
     * @namespace core.user.register
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {number} userOptions.nonce - nonce which was used to predict address, use it only when Safe was not deployed yet
     * @param {string} userOptions.safeAddress - owned Safe address
     * @param {string} userOptions.username - alphanumerical username
     * @param {string} userOptions.email - email address
     *
     * @return {boolean} - Returns true when successful
     */
    register: async (account, userOptions) => {
        checkAccount(web3, account);
  
        const options = checkOptions(userOptions, {
          nonce: {
            type: 'number',
            default: 0,
          },
          safeAddress: {
            type: web3.utils.checkAddressChecksum,
          },
          username: {
            type: 'string',
            default: '',
          },
          email: {
            type: 'string',
            default: '',
          },
          avatarUrl: {
            type: 'string',
            default: '',
          },
        });
  
        const { address } = account;
        const { nonce, avatarUrl, safeAddress, username, email } = options;
  
        const { signature } = web3.eth.accounts.sign(
          [address, nonce, safeAddress, username].join(''),
          account.privateKey,
        );
  
        await utils.requestAPI({
          path: ['users'],
          method: 'PUT',
          data: {
            address: account.address,
            nonce: nonce > 0 ? nonce : null,
            signature,
            data: {
              email,
              safeAddress,
              username,
              avatarUrl,
            },
          },
        });
  
        return true;
      },



web3.eth.accounts.sign('Some data', '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318');
> {
    message: 'Some data',
    messageHash: '0x1da44b586eb0729ff70a73c326926f6ed5a25f5b056e7f47fbc6e58d86871655',
    v: '0x1c',
    r: '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd',
    s: '0x6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a029',
    signature: '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c'
}


    /**
     * Make a request to the Circles server API.
     *
     * @namespace core.utils.requestAPI
     *
     * @param {Object} userOptions - API query options
     * @param {string} userOptions.path - API route
     * @param {string} userOptions.method - HTTP method
     * @param {Object} userOptions.data - Request body (JSON)
     *
     * @return {Object} - API response
     */
    requestAPI: async (userOptions) => {
        const options = checkOptions(userOptions, {
          path: {
            type: 'array',
          },
          method: {
            type: 'string',
            default: 'GET',
          },
          data: {
            type: 'object',
            default: {},
          },
        });
  
        return request(apiServiceEndpoint, {
          data: options.data,
          method: options.method,
          path: ['api'].concat(options.path),
        });
      },
  

      