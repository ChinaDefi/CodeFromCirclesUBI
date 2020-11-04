//wb_changeTust.js

// Change trust state with users  更改与用户的信任状态
await core.trust.removeConnection(account, {
    user: users[0].safeAddress,
    canSendTo: safeAddress,
  });
  
// .. give user the permission to send their Token to you  授予用户向您发送令牌的权限
await core.trust.addConnection(account, {
user: users[0].safeAddress,
canSendTo: safeAddress,
limitPercentage: 20,
});


/**
     * Revoke a trust connection with a user. You don't allow this
     * user to transfer their Token to or through you.
     *
     * @namespace core.trust.removeConnection
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {string} userOptions.user - trust receiver / sender
     * @param {string} userOptions.canSendTo - trust giver / receiver
     *
     * @return {string} - transaction hash
     */
    removeConnection: async (account, userOptions) => {
        checkAccount(web3, account);
  
        const options = checkOptions(userOptions, {
          user: {
            type: web3.utils.checkAddressChecksum,
          },
          canSendTo: {
            type: web3.utils.checkAddressChecksum,
          },
        });
  
        const txData = await hub.methods
          .trust(options.user, NO_LIMIT_PERCENTAGE)
          .encodeABI();
  
        return await utils.executeTokenSafeTx(account, {
          safeAddress: options.canSendTo,
          to: hub.options.address,
          txData,
        });
      },
    };
  }
  
  
  



/**
     * Give other users possibility to send their Circles to you by
     * giving them your trust.
     *
     * @namespace core.trust.addConnection
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {string} userOptions.user - trust receiver / sender
     * @param {string} userOptions.canSendTo - trust giver / receiver
     * @param {number} userOptions.limitPercentage - trust limit in % for transitive transactions
     *
     * @return {string} - transaction hash
     */
    addConnection: async (account, userOptions) => {
        checkAccount(web3, account);
  
        const options = checkOptions(userOptions, {
          user: {
            type: web3.utils.checkAddressChecksum,
          },
          canSendTo: {
            type: web3.utils.checkAddressChecksum,
          },
          limitPercentage: {
            type: 'number',
            default: DEFAULT_LIMIT_PERCENTAGE,
          },
        });
  
        const txData = await hub.methods
          .trust(options.user, options.limitPercentage)
          .encodeABI();
  
        // Call method and return result
        return await utils.executeTokenSafeTx(account, {
          safeAddress: options.canSendTo,
          to: hub.options.address,
          txData,
        });
      },




      /// @notice trust a user, calling this means you're able to receive tokens from this user transitively
    /// @dev the trust graph is weighted and directed
    /// @param user the user to be trusted
    /// @param limit the amount this user is trusted, as a percentage of 100
    function trust(address user, uint limit) public {
        // only users who have signed up as tokens or organizations can enter the trust graph
        require(address(userToToken[msg.sender]) != address(0) || organizations[msg.sender], "You can only trust people after you've signed up!");
        // you must continue to trust yourself 100%
        require(msg.sender != user, "You can't untrust yourself");
        // organizations can't receive trust since they don't have their own token (ie. there's nothing to trust)
        require(organizations[user] == false, "You can't trust an organization");
        // must a percentage
        require(limit <= 100, "Limit must be a percentage out of 100");
        // organizations don't have a token to base send limits off of, so they can only trust at rates 0 or 100
        if (organizations[msg.sender]) {
            require(limit == 0 || limit == 100, "Trust is binary for organizations");
        }
        _trust(user, limit);
    }

    /// @dev used internally in both the trust function and signup
    /// @param user the user to be trusted
    /// @param limit the amount this user is trusted, as a percentage of 100
    function _trust(address user, uint limit) internal {
        limits[msg.sender][user] = limit;
        emit Trust(msg.sender, user, limit);
    }