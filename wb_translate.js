//wb_translate.js

/**
     * Transfer Circles from one user to another.
     *
     * @namespace core.token.transfer
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - options
     * @param {string} userOptions.from - sender address
     * @param {string} userOptions.to - receiver address
     * @param {BN} userOptions.value - value
     * @param {string} userOptions.paymentNote - optional payment note stored in API
     *
     * @return {string} - transaction hash
     */
    transfer: async (account, userOptions) => {
        checkAccount(web3, account);
  
        const options = checkOptions(userOptions, {
          from: {
            type: web3.utils.checkAddressChecksum,
          },
          to: {
            type: web3.utils.checkAddressChecksum,
          },
          value: {
            type: web3.utils.isBN,
          },
          paymentNote: {
            type: 'string',
            default: '',
          },
        });
  
        const transfer = {
          tokenOwners: [],
          sources: [],
          destinations: [],
          values: [],
        };
  
        // Try first to send the transaction directly, this saves us the
        // roundtrip through the api   // 居然还需要通过API
        const sendLimit = await hub.methods
          .checkSendLimit(options.from, options.from, options.to)
          .call();
  

        /*

web3.utils.toBN(1234).toString();
> "1234"

web3.utils.toBN('1234').add(web3.utils.toBN('1')).toString();
> "1235"

web3.utils.toBN('0xea').toString();
> "234"

        */

        if (
          web3.utils
            .toBN(sendLimit)
            .gte(web3.utils.toBN(web3.utils.toBN(options.value.toString())))
        ) {
          // Direct transfer is possible, fill in the required transaction data
          transfer.tokenOwners.push(options.from);
          transfer.sources.push(options.from);
          transfer.destinations.push(options.to);
          transfer.values.push(options.value.toString());
        } else {
          // This seems to be a little bit more complicated ..., request API to
          // find transitive transfer path
          let response;
          try {
            response = await findTransitiveTransfer(web3, utils, options);
  
            if (response.transferSteps.length === 0) {
              throw new TransferError(
                'No possible transfer found',
                ErrorCodes.TRANSFER_NOT_FOUND,
                {
                  ...options,
                  response,
                },
              );
            }
  
            if (response.transferSteps.length > MAX_TRANSFER_STEPS) {
              throw new TransferError(
                'Too many transfer steps',
                ErrorCodes.TOO_COMPLEX_TRANSFER,
                {
                  ...options,
                  response,
                },
              );
            }

/*
web3.utils.toWei('1', 'ether');
> "1000000000000000000"
*/
            // Convert connections to contract argument format
            response.transferSteps.forEach((transaction) => {
              transfer.tokenOwners.push(transaction.tokenOwnerAddress);
              transfer.sources.push(transaction.from);
              transfer.destinations.push(transaction.to);
              transfer.values.push(
                web3.utils.toWei(transaction.value.toString(), 'ether'),
              );
            });
          } catch (error) {
            if (!error.code) {
              throw new TransferError(
                error.message,
                ErrorCodes.INVALID_TRANSFER,
                {
                  ...options,
                  response,
                },
              );
            } else {
              throw error;
            }
          }
        }
  
        const txData = await hub.methods
          .transferThrough(
            transfer.tokenOwners,
            transfer.sources,
            transfer.destinations,
            transfer.values,
          )
          .encodeABI();
  
        const txHash = await utils.executeTokenSafeTx(account, {
          safeAddress: options.from,
          to: hub.options.address,
          txData,
        });
  
        // Do not store the transfer in the API when there is no paymentNote
        if (options.paymentNote.length === 0) {
          return txHash;
        }
  
        // Something went wrong
        if (!txHash) {
          return null;
        }
  
        // If everything went well so far we can store the paymentNote in the API
        const { signature } = web3.eth.accounts.sign(
          [options.from, options.to, txHash].join(''),
          account.privateKey,
        );
  
        await utils.requestAPI({
          path: ['transfers'],
          method: 'PUT',
          data: {
            address: account.address,
            signature,
            data: {
              from: options.from,
              to: options.to,
              transactionHash: txHash,
              paymentNote: options.paymentNote,
            },
          },
        });
  
        return txHash;
      },



    // hub.sol

    /// @notice finds the maximum amount of a specific token that can be sent between two users
    /// @dev the goal of this function is to always return a sensible number, it's used to validate transfer throughs, and also heavily in the graph/pathfinding services
    /// @param tokenOwner the safe/owner that the token was minted to
    /// @param src the sender of the tokens
    /// @param dest the recipient of the tokens
    /// @return the amount of tokenowner's token src can send to dest
    function checkSendLimit(address tokenOwner, address src, address dest) public view returns (uint256) {

        // there is no trust
        if (limits[dest][tokenOwner] == 0) {
            return 0;
        }

        // if dest hasn't signed up, they cannot trust anyone
        if (address(userToToken[dest]) == address(0) && !organizations[dest] ) {
            return 0;
        }

        //if the token doesn't exist, it can't be sent/accepted
        if (address(userToToken[tokenOwner]) == address(0)) {
             return 0;
        }

        uint256 srcBalance = userToToken[tokenOwner].balanceOf(src);

        // if sending dest's token to dest, src can send 100% of their holdings
        // for organizations, trust is binary - if trust is not 0, src can send 100% of their holdings
        if (tokenOwner == dest || organizations[dest]) {
            return srcBalance;
        }

        // find the amount dest already has of the token that's being sent
        uint256 destBalance = userToToken[tokenOwner].balanceOf(dest);
        
        // find the maximum possible amount based on dest's trust limit for this token
        uint256 max = (userToToken[dest].balanceOf(dest).mul(limits[dest][tokenOwner])).div(100);
        
        // if trustLimit has already been overriden by a direct transfer, nothing more can be sent
        if (max < destBalance) return 0;
        
        // return the max amount dest is willing to hold minus the amount they already have
        return max.sub(destBalance);
    }



     /**
     * This algorithm makes use of the Ford-Fulkerson method which computes the
     * maximum flow in a trust network between two users. It returns the
     * maximum flow and the transfer steps in the graph for a value (when
     * possible).
     *
     * This method does not execute any real transactions.
     *
     * @namespace core.token.findTransitiveTransfer
     *
     * @param {Object} account - web3 account instance
     * @param {Object} userOptions - search arguments
     * @param {string} userOptions.from - sender Safe address
     * @param {string} userOptions.to - receiver Safe address
     * @param {BN} userOptions.value - value for transactions path
     *
     * @return {Object} - maximum possible Circles value and transactions path
     */
    findTransitiveTransfer: async (account, userOptions) => {
        checkAccount(web3, account);
        return await findTransitiveTransfer(web3, utils, userOptions);
      },
  

      const MAX_TRANSFER_STEPS = 5; // The contracts have a complexity limit due to block gas limits

      /**
       * Find maximumFlow and transfer steps through a trust graph from someone to
       * someone else to transitively send an amount of Circles.
       *
       * @access private
       *
       * @param {Web3} web3 - Web3 instance
       * @param {Object} utils - core utils
       * @param {Object} userOptions - search arguments
       * @param {string} userOptions.from - sender Safe address
       * @param {string} userOptions.to - receiver Safe address
       * @param {BN} userOptions.value - value of Circles tokens
       *
       * @return {Object[]} - transaction steps
       */
      export async function findTransitiveTransfer(web3, utils, userOptions) {
        const options = checkOptions(userOptions, {
          from: {
            type: web3.utils.checkAddressChecksum,
          },
          to: {
            type: web3.utils.checkAddressChecksum,
          },
          value: {
            type: web3.utils.isBN,
          },
        });
      
        try {
          const response = await utils.requestAPI({
            path: ['transfers'],
            method: 'POST',
            data: {
              from: options.from,
              to: options.to,
              value: parseFloat(
                web3.utils.fromWei(options.value.toString(), 'ether'),
              ),
            },
          });
      
          return response.data;
        } catch (error) {
          throw new TransferError(error.message, ErrorCodes.UNKNOWN_ERROR);
        }
      }
      


//hub.sol

   /// @dev performs the validation for an attempted transitive transfer
    /// @param steps the number of steps in the transitive transaction
    function validateTransferThrough(uint256 steps) internal {
        // a valid path has only one real sender and receiver
        address src;
        address dest;
        // iterate through the array of all the addresses that were part of the transaction data
        for (uint i = 0; i < seen.length; i++) {
            transferValidator memory curr = validation[seen[i]];
            // if the address sent more than they received, they are the sender
            if (curr.sent > curr.received) {
                // if we've already found a sender, transaction is invalid
                require(src == address(0), "Path sends from more than one src");
                // the real token sender must also be the transaction sender
                require(seen[i] == msg.sender, "Path doesn't send from transaction sender");
                src = seen[i];
            }
            // if the address received more than they sent, they are the recipient
            if (curr.received > curr.sent) {
                // if we've already found a recipient, transaction is invalid
                require(dest == address(0), "Path sends to more than one dest");
                dest = seen[i];
            }
        }
        // a valid path has both a sender and a recipient
        require(src != address(0), "Transaction must have a src");
        require(dest != address(0), "Transaction must have a dest");
        // sender should not recieve, recipient should not send
        // by this point in the code, we should have one src and one dest and no one else's balance should change
        require(validation[src].received == 0, "Sender is receiving");
        require(validation[dest].sent == 0, "Recipient is sending");
        // the total amounts sent and received by sender and recipient should match
        require(validation[src].sent == validation[dest].received, "Unequal sent and received amounts");
        // the maximum amount of addresses we should see is one more than steps in the path
        require(seen.length <= steps + 1, "Seen too many addresses");
        emit HubTransfer(src, dest, validation[src].sent);
        // clean up the validation datastructures
        for (uint i = seen.length; i >= 1; i--) {
            delete validation[seen[i-1]];
        }
        delete seen;
        // sanity check that we cleaned everything up correctly
        require(seen.length == 0, "Seen should be empty");
    }

    /// @notice walks through tokenOwners, srcs, dests, and amounts array and executes transtive transfer
    /// @dev tokenOwners[0], srcs[0], dests[0], and wads[0] constitute a transaction step
    /// @param tokenOwners the owner of the tokens being sent in each transaction step
    /// @param srcs the sender of each transaction step
    /// @param dests the recipient of each transaction step
    /// @param wads the amount for each transaction step
    function transferThrough(
        address[] memory tokenOwners,
        address[] memory srcs,
        address[] memory dests,
        uint[] memory wads
    ) public {
        // all the arrays must be the same length
        require(dests.length == tokenOwners.length, "Tokens array length must equal dests array");
        require(srcs.length == tokenOwners.length, "Tokens array length must equal srcs array");
        require(wads.length == tokenOwners.length, "Tokens array length must equal amounts array");
        for (uint i = 0; i < srcs.length; i++) {
            address src = srcs[i];
            address dest = dests[i];
            address token = tokenOwners[i];
            uint256 wad = wads[i];
            
            // check that no trust limits are violated
            uint256 max = checkSendLimit(token, src, dest);
            require(wad <= max, "Trust limit exceeded");

            buildValidationData(src, dest, wad);
            
            // go ahead and do the transfers now so that we don't have to walk through this array again
            userToToken[token].hubTransfer(src, dest, wad);
        }
        // this will revert if there are any problems found
        validateTransferThrough(srcs.length);
    }
}

/// @dev builds the validation data structures, called for each transaction step of a transtive transactions
    /// @param src the sender of a single transaction step
    /// @param dest the recipient of a single transaction step
    /// @param wad the amount being passed along a single transaction step
    function buildValidationData(address src, address dest, uint wad) internal {
        // the validation mapping has this format
        // { address: {
        //     seen: whether this user is part of the transaction,
        //     sent: total amount sent by this user,
        //     received: total amount received by this user,
        //    }
        // }
        if (validation[src].seen != false) {
            // if we have seen the addresses, increment their sent amounts
            validation[src].sent = validation[src].sent.add(wad);
        } else {
            // if we haven't, add them to the validation mapping
            validation[src].seen = true;
            validation[src].sent = wad;
            seen.push(src);
        }
        if (validation[dest].seen != false) {
            // if we have seen the addresses, increment their sent amounts
            validation[dest].received = validation[dest].received.add(wad);
        } else {
            // if we haven't, add them to the validation mapping
            validation[dest].seen = true;
            validation[dest].received = wad; 
            seen.push(dest);   
        }
    }


/// @notice special method called by the hub to execute a transitive transaction
    /// @param from the address the tokens are being transfered from
    /// @param to the address the tokens are being transferred to
    /// @param amount the amount of tokens to transfer
    function hubTransfer(
        address from, address to, uint256 amount
    ) public onlyHub returns (bool) {
        _transfer(from, to, amount);
    }

    function transfer(address dst, uint wad) public override returns (bool) {
        // this code shouldn't be necessary, but when it's removed the gas estimation methods
        // in the gnosis safe no longer work, still true as of solidity 7.1
        return super.transfer(dst, wad);
    }

    
     /// @dev modifier allowing function to be only called through the hub
     modifier onlyHub() {
        require(msg.sender == hub);
        _;
    }
