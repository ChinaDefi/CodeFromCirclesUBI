// change trust status  core.safe.deploy


// Check if we have enough trust connections 检查我们是否有足够的信任连接
const { isTrusted } = await core.trust.isTrusted({
  safeAddress,
});

if (!isTrusted) {
  console.log('Not enough trust connections yet ..');
} else {
  // Deploy Safe
  await core.safe.deploy(account, { safeAddress });

  // Deploy Circles Token
  await core.token.deploy(account, { safeAddress });
}


@namespace core.trust.isTrusted
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {string} userOptions.safeAddress - Safe address of user
     * @param {string} userOptions.limit - Incoming trust limit
     *
     * @return {Object} Trust state and number of connections
     */
    isTrusted: async (account, userOptions) => {
      checkAccount(web3, account);

      const options = checkOptions(userOptions, {
        safeAddress: {
          type: web3.utils.checkAddressChecksum,
        },
        limit: {
          type: 'number',
          default: DEFAULT_TRUST_LIMIT,
        },
      });

      const safeAddress = options.safeAddress.toLowerCase();

      const response = await utils.requestGraph({
        query: `{
          trusts(where: { userAddress: "${safeAddress}" }) {
            id
            limitPercentage
          }
        }`,
      });

      if (!response) {
        return {
          trustConnections: 0,
          isTrusted: false,
        };
      }

      const trustConnections = response.trusts.filter((connection) => {
        return parseInt(connection.limitPercentage, 10) !== NO_LIMIT_PERCENTAGE;
      });

      return {
        trustConnections: trustConnections.length,
        isTrusted: trustConnections.length >= options.limit,
      };
    },


    /**
     * Requests the relayer to not wait for the Safe deployment task.
     * This might still fail when the Safe is not funded or does not
     * have enough trust connections yet.
     *
     * @namespace core.safe.deploy
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {number} userOptions.safeAddress - to-be-deployed Safe address
     *
     * @return {boolean} - returns true when successful
     */
    deploy: async (account, userOptions) => {
        checkAccount(web3, account);
  
        const options = checkOptions(userOptions, {
          safeAddress: {
            type: web3.utils.checkAddressChecksum,
          },
        });
  
        await utils.requestRelayer({
          path: ['safes', options.safeAddress, 'funded'],
          version: 2,
          method: 'PUT',
        });
  
        return true;
      },


    /**
     * Deploy new Circles Token for a user.
     *
     * @namespace core.token.deploy
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {string} userOptions.safeAddress - owner of the Token
     *
     * @return {string} - transaction hash
     */
    deploy: async (account, userOptions) => {
      checkAccount(web3, account);

      const options = checkOptions(userOptions, {
        safeAddress: {
          type: web3.utils.checkAddressChecksum,
        },
      });

      const txData = await hub.methods.signup().encodeABI();

      // Call method and return result
      return await utils.executeSafeTx(account, {
        safeAddress: options.safeAddress,
        to: hub.options.address,
        txData,
      });
    },


//.sol代码   hub中的signup

    /// @notice signup to this circles hub - create a circles token and join the trust graph
    /// @dev signup is permanent, there's no way to unsignup
    function signup() public {
      // signup can only be called once
      require(address(userToToken[msg.sender]) == address(0), "You can't sign up twice");
      // organizations cannot sign up for a token
      require(organizations[msg.sender] == false, "Organizations cannot signup as normal users");

      Token token = new Token(msg.sender);
      userToToken[msg.sender] = token;
      tokenToUser[address(token)] = msg.sender;
      // every user must trust themselves with a weight of 100
      // this is so that all users accept their own token at all times
      _trust(msg.sender, 100);

      emit Signup(msg.sender, address(token));
  }




  /**
     * Send a transaction to the relayer which will be executed by it.
     * The gas costs will be estimated by the relayer before.
     *
     * @namespace core.utils.executeSafeTx
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - query options
     * @param {string} userOptions.safeAddress - address of Safe
     * @param {string} userOptions.to - forwarded address (from is the relayer)
     * @param {string} userOptions.gasToken - address of ERC20 token
     * @param {Object} userOptions.txData - encoded transaction data
     * @param {number} userOptions.value - value in Wei
     *
     * @return {string} - transaction hash
     */
    executeSafeTx: async (account, userOptions) => {
      checkAccount(web3, account);

      const options = checkOptions(userOptions, {
        safeAddress: {
          type: web3.utils.checkAddressChecksum,
        },
        to: {
          type: web3.utils.checkAddressChecksum,
        },
        gasToken: {
          type: web3.utils.checkAddressChecksum,
          default: ZERO_ADDRESS,
        },
        txData: {
          type: web3.utils.isHexStrict,
          default: '0x',
        },
        value: {
          type: 'number',
          default: 0,
        },
      });

      const { to, gasToken, txData, value, safeAddress } = options;
      const operation = CALL_OP;
      const refundReceiver = ZERO_ADDRESS;

      const { dataGas, gasPrice, safeTxGas } = await estimateTransactionCosts(
        relayServiceEndpoint,
        {
          gasToken,
          operation,
          safeAddress,
          to,
          txData,
          value,
        },
      );

      // Register transaction in waiting queue
      const ticketId = transactionQueue.queue(safeAddress);

      // Wait until Relayer allocates enough funds to pay for transaction
      const totalGasEstimate = web3.utils
        .toBN(dataGas)
        .add(new web3.utils.BN(safeTxGas))
        .mul(new web3.utils.BN(gasPrice));

      await loop(
        () => {
          return web3.eth.getBalance(safeAddress);
        },
        (balance) => {
          return web3.utils.toBN(balance).gte(totalGasEstimate);
        },
      );

      // Wait until transaction can be executed
      await waitForPendingTransactions(
        web3,
        relayServiceEndpoint,
        safeAddress,
        ticketId,
      );

      // Request nonce for Safe
      const nonce = await requestNonce(web3, relayServiceEndpoint, safeAddress);

      // Prepare EIP712 transaction data and sign it
      const typedData = formatTypedData(
        to,
        value,
        txData,
        operation,
        safeTxGas,
        dataGas,
        gasPrice,
        gasToken,
        refundReceiver,
        nonce,
        safeAddress,
      );

      const signature = signTypedData(web3, account.privateKey, typedData);

      // Send transaction to relayer
      try {
        const { txHash } = await requestRelayer(relayServiceEndpoint, {
          path: ['safes', safeAddress, 'transactions'],
          method: 'POST',
          version: 1,
          data: {
            to,
            value,
            data: txData,
            operation,
            signatures: [signature],
            safeTxGas,
            dataGas,
            gasPrice,
            nonce,
            gasToken,
          },
        });

        // Register transaction so we can check later if it finished
        transactionQueue.lockTransaction(safeAddress, {
          nonce,
          ticketId,
          txHash,
        });

        return txHash;
      } catch {
        transactionQueue.unlockTransaction(safeAddress, ticketId);
        transactionQueue.unqueue(safeAddress, ticketId);

        return null;
      }
    },