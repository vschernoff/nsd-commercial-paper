/* globals angular */
/* jshint eqeqeq: false */
/* jshint -W014 */

/**
 * @param $scope
 * @param $q
 * @param $filter
 * @param {InstructionService} InstructionService
 * @param {BookService} BookService
 * @param {UserService} UserService
 * @param {DialogService} DialogService
 * @param {ConfigLoader} ConfigLoader
 * @constructor
 *
 * @class InstructionsController
 * @ngInject
 */
function InstructionsController($scope, $q, $filter, InstructionService, BookService, UserService, DialogService, ConfigLoader) {
  "use strict";

  var ctrl = this;
  ctrl.list = [];
  ctrl.redeemList = [];

  // var DATE_INPUT_FORMAT = 'dd/mm/yyyy';
  var DATE_FABRIC_FORMAT = 'yyyy-mm-dd'; // ISO
  var TRANSFER_SIDE_TRANSFERER = 'transferer';
  var TRANSFER_SIDE_RECEIVER = 'receiver';
  var NSD_ROLE = 'nsd';


  ctrl.org = ConfigLoader.get().org;
  ctrl.account = ConfigLoader.getAccount(ctrl.org);

  /**
   * @type {boolean}
   */
  ctrl.test = true;



  /**
   *
   */
  ctrl.init = function(){
      $scope.$on('chainblock', function(e, block) {
        if( InstructionService.isBilateralChannel(block.getChannel()) || block.getChannel() === BookService.getChannelID()){
          ctrl.reload();
        }
      });
      ctrl.reload();
  };

  /**
   *
   */
  ctrl.reload = function(){
    ctrl.invokeInProgress = true;
    return $q.all([
      InstructionService.listAll()
        .then(function(list){
          ctrl.list = list;
        }),

      UserService.getOrgRole() !== NSD_ROLE
      ? $q.resolve()
      : BookService.redeemHistory()
        .then(function(redeemList){
          ctrl.redeemList = redeemList;
        })
    ])
    .finally(function(){
      ctrl.invokeInProgress = false;
    });
  };


  ctrl.isTransferer = function(instruction){
    var acc = Object.keys(ctrl.account.acc);
    return acc.indexOf(instruction.transferer.account) > -1;
  };

  ctrl.isReceiver = function(instruction){
    var acc = Object.keys(ctrl.account.acc);
    return acc.indexOf(instruction.receiver.account) > -1;
  };

  /**
   * @param {Instruction} instruction
   * @param {boolean} getTheOppositeSide
   */
  ctrl.getInstructionID = function(instruction, getTheOppositeSide){
    if(instruction.type === 'dvp') {
      if (instruction.initiator === 'transferer' ^ getTheOppositeSide) {
        return 'INSTRUCTION_TRANSFER_DVP_ID';
      } else {
        return 'INSTRUCTION_RECEIVER_DVP_ID';
      }
    } else {
      // type === 'fop'
      if (instruction.initiator === 'transferer' ^ getTheOppositeSide) {
        return 'INSTRUCTION_TRANSFER_FOP_ID';
      } else {
        return  'INSTRUCTION_RECEIVER_FOP_ID';
      }
    }
  };


  ctrl.isInitiator = function(instruction){
    return instruction.initiator === 'transferer' ? ctrl.isTransferer(instruction) : ctrl.isReceiver(instruction);
  };

  ctrl.isAdmin = function(){
    return ctrl.org === NSD_ROLE;
  };



  ctrl.isInstructionXmlAvailable = function(instruction) {
    return instruction.status=='executed'
      || instruction.status=='receiver-signed'
      || instruction.status=='transferer-signed'
      || instruction.status=='downloaded';
  }

  ctrl.getInstructionXmlLink = function(instruction, side, inverse) {
    var data;
    switch ( side ) {
      case 'transferer': data = inverse ? instruction.alamedaTo : instruction.alamedaFrom; break;
      case 'receiver':   data = inverse ? instruction.alamedaFrom : instruction.alamedaTo; break;
      default: throw new Error('Unknown side: ' + side);
    }
    return 'data:application/octet-stream;base64,' + btoa( data );
  }

  ctrl.getInstructionFilename = function(instruction, side, inverse) {
    if (inverse) {
      if(side == 'transferer'){
         side = 'receiver'
      } else if(side == 'receiver'){
         side = 'transferer'
      }
    }
    return side + '-' + instructionFilename(instruction) + '.xml';
  }

  /**
   *
   */
  function instructionFilename(instruction) {
    var filenameTemplate = '%s-%s-%s-%s-%s-%s-%s-%s-%s';

    var args = [
      instruction.type,
      instruction.security,

      instruction.transferer.account,
      instruction.transferer.division,

      instruction.receiver.account,
      instruction.receiver.division,

      instruction.quantity,
      instruction.reference,
      instruction.instructionDate.replace(/-/g, ''),
      instruction.tradeDate.replace(/-/g, '')
    ];

    if (instruction.type === 'dvp') {
      var filenameTemplate = '%s-%s-%s-%s-%s-%s-%s-%s-%s-%s-%s-%s-%s-%s-%s';
      args.push.apply(args, [
        instruction.transfererRequisites.account,
        instruction.transfererRequisites.bic,
        instruction.receiverRequisites.account,
        instruction.receiverRequisites.bic,
        instruction.paymentAmount,
        instruction.paymentCurrency
      ]);
    }

    args.unshift(filenameTemplate);
    return format.apply(null, args);

  }

  /**
   *
   */
  function format(/*args*/) {
    var args = Array.prototype.slice.call(arguments);
    var str = args[0];
    for (var i = 1; i < args.length; i++) {
      str = str.replace('%s', args[i]);
    }
    return str;
  }

  /**
   *
   * @param inst instruction
   * @param type instruction type
   * @returns {boolean} true if instruction should be displayed
   */
  ctrl.showInstruction = function(inst, type) {
    var acc = Object.keys(ctrl.account.acc);
    return ctrl.org === NSD_ROLE ||
        (type === TRANSFER_SIDE_TRANSFERER && acc.indexOf(inst.transferer.account) > -1) ||
        (type === TRANSFER_SIDE_RECEIVER && acc.indexOf(inst.receiver.account) > -1);
        // (acc.indexOf(inst.transferer.account) > -1) || (acc.indexOf(inst.receiver.account) > -1);
  };

  /**
   * Displays reason based on role
   *
   * @param inst instruction
   * @param key object key that should be compared
   */
  ctrl.showReason = function(inst, key) {
    var curDep = inst[key];
    return ctrl.org === NSD_ROLE || curDep === ctrl.account.dep;
  };

  /**
   * @return {Instruction}
   */
  ctrl._getDefaultInstruction = function(transferSide, opponentID){
    var orgID = ctrl.org;
    return {
      transferer: {
        deponent: ctrl._getDeponentCode(transferSide === TRANSFER_SIDE_TRANSFERER ? orgID : opponentID)
      },
      receiver: {
        deponent: ctrl._getDeponentCode(transferSide === TRANSFER_SIDE_RECEIVER ? orgID : opponentID)
      },
      initiator: transferSide,
      // quantity: 0, // TODO: cause ui bug with overlapping label and input field with value
      tradeDate    : new Date(),
      instructionDate : new Date(),


      transfererRequisites:{
        bic: "044525505"
      },
      receiverRequisites:{
        bic: "044525505"
      },
      paymentCurrency: 'RUB'

    };
  };

  ctrl._getDeponentCode = function(orgID){
    if(orgID === ctrl.org) {
      return ctrl.account.dep;
    }
    var account = ConfigLoader.getAccount(orgID) || {};
    return account.dep;
  };

  /**
   *
   */
  ctrl.getStatusClass = function(status){
    switch(status){
      case 'matched' : return 'deep-purple-text';
      case 'declined': return 'red-text darken-4';
      case 'executed': return 'green-text darken-4';
      case 'canceled': return 'grey-text';
      default: return '';
    }
  };

  /**
   * @param {Instruction} instruction
   * @return {boolean}
   */
  ctrl.canRollback = function(instruction){
    return instruction.status === 'downloaded'
      || instruction.status === 'rollbackDeclined';
      // || instruction.status === 'executed'
      // || instruction.status === 'signed'

  };

  /**
   * @param {Instruction} instruction
   */
  ctrl.rollbackInstruction = function(instruction){
    var cancelInstructionMessage = $filter('translate')('ROLLBACK_INSTRUCTION_PROMPT')
      .replace('%s', instruction.deponentFrom)
      .replace('%s', instruction.deponentTo);

    return DialogService.confirmReason(cancelInstructionMessage, {yesKlass:'red white-text'})
      .then(function(result){
        if(result.confirmed){
          ctrl.invokeInProgress = true;
          return InstructionService.rollbackInstruction(instruction, result.reason)
            .finally(function(){
              ctrl.invokeInProgress = false;
            });
        }
      });
  };

  ctrl.cancelInstruction = function(instruction){
    var cancelInstructionMessage = $filter('translate')('CANCEL_INSTRUCTION_PROMPT')
      .replace('%s', instruction.deponentFrom)
      .replace('%s', instruction.deponentTo);

    return DialogService.confirm(cancelInstructionMessage, {yesKlass:'red white-text'})
      .then(function(isConfirmed){
        if(isConfirmed){
          ctrl.invokeInProgress = true;
          return InstructionService.cancelInstruction(instruction)
            .finally(function(){
              ctrl.invokeInProgress = false;
            });
        }
      });

  };


  /**
   *
   */
  ctrl.newInstructionTransfer = function(transferSide, _channel){
    if(!$scope.inst || $scope.inst.initiator !== transferSide){
        // preset values

        var opponentOrgID = ctrl._getOrgIDByChannel(_channel);
        $scope.inst = ctrl._getDefaultInstruction(transferSide, opponentOrgID);
        $scope.formInstruction.$setPristine();
    }
  };




  /**
   *
   */
  ctrl._getOrgIDByChannel = function(channelID){
    if(!channelID) {
      return null;
    }
    return channelID.split('-').filter(function(org){ return org !== ctrl.org; })[0];
  };

  /**
   *
   */
  ctrl.sendInstruction = function(instruction){
    $scope.inst = null;

    instruction.deponentFrom = instruction.transferer.deponent;
    instruction.deponentTo = instruction.receiver.deponent;

    // FIXME here date can come in two different formats:
    //  Date object when we change form value
    //  String (like '1 August, 2017') when we not change form value
    // Now we use formatDate() to transform both of it into ISO
    instruction.tradeDate        = formatDate(instruction.tradeDate);
    instruction.instructionDate  = formatDate(instruction.instructionDate);
    if(instruction.reason && instruction.reason.created){
      instruction.reason.created   = formatDate(instruction.reason.created);
    }

    var p;
    switch(instruction.initiator){
      case TRANSFER_SIDE_TRANSFERER:
        p = InstructionService.transfer(instruction);
        break;
      case TRANSFER_SIDE_RECEIVER:
        p = InstructionService.receive(instruction);
        break;
      default:
        throw new Error('Unknown transfer side: ' + instruction.initiator);
    }


    ctrl.invokeInProgress = true;
    return p.finally(function(){
      ctrl.invokeInProgress = false;
    });
  };

  /**
   * Parse date in format dd/mm/yyyy
   * @param {string|Date} date
   * @return {Date}
   */
  function formatDate(date) {
    if(!date) {
      return null;
    }

    if(!(date instanceof Date)){
      // assumind date is a string: '1 August, 2017'
      // TODO: we shouldn't rely on this
      date = new Date(date);
    }
    return date.format(DATE_FABRIC_FORMAT);
  }


  /**
   *
   */
  ctrl.newRedemption = function(){
    $scope.redemption = $scope.redemption || ctrl._getDefaultRedemption();
  };
  /**
   * @return {Redemption}
   */
  ctrl._getDefaultRedemption = function(){
    return {
      reason:{
        created   : new Date()//.format(DATE_INPUT_FORMAT)
      }
    };
  };

  /**
   * @param {Redemption} redemption
   */
  ctrl.sendRedemption = function(redemption){
    return DialogService.confirm( $filter('translate')('REDEEM_INSTRUCTION_PROMPT').replace('%s', redemption.security), {yesKlass:'red white-text'})
      .then(function(isConfirmed){
        if(isConfirmed){

          ctrl.invokeInProgress = true;
          return BookService.redeem(redemption)
            .finally(function(){
              ctrl.invokeInProgress = false;
            });
        }
      })
      .then(function(){
        $scope.redemption = null;
      });
  };


  /**
   * @param {Instruction} instruction
   */
  ctrl.showHistory = function(instruction){
    return InstructionService.history(instruction)
      .then(function(result){
        var scope = {history: result, getStatusClass: ctrl.getStatusClass, showReason: ctrl.showReason};
        return DialogService.dialog('balance-history.html', scope);
      });
  };

  ctrl.isShowABPrefill = function(transferSide){
      var orglc = (''+UserService.getOrg()).toLowerCase();
      return ( orglc === 'sberbank' && transferSide === 'transferer')
          || ( orglc === 'mts' && transferSide === 'receiver');
  };

  /**
   * @param transferSide
   * @return {Instruction}
   */
  ctrl.getABStub = function(transferSide){
    var accountConfig = ConfigLoader.get()['account-config'];
    var orgFrom = 'sberbank';
    var orgTo   = 'mts';
    return {
      type:'dvp',

      transfererRequisites:{
        account: "40701810000000003000",
        bic: "044525505"
      },
      receiverRequisites:{
        account: "40701810000000002000",
        bic: "044525505"
      },
      paymentAmount: 30000000,
      paymentCurrency: 'RUB',
      additionalInformation: transferSide === 'receiver' ? {description: 'payment no. DLT/001'} : null,

      security:'RU000A0JVVB5',
      transferer:{
        deponent: accountConfig[orgFrom].dep,
        account : Object.keys(accountConfig[orgFrom].acc)[0],
        division: accountConfig[orgFrom].acc[ Object.keys(accountConfig[orgFrom].acc)[0] ][0]
      },
      receiver:{
        deponent: accountConfig[orgTo].dep,
        account : Object.keys(accountConfig[orgTo].acc)[0],
        division: accountConfig[orgTo].acc[ Object.keys(accountConfig[orgTo].acc)[0] ][0]
      },
      initiator: transferSide,
      quantity: 1,
      reference: 'test',
      memberInstructionId: 123,
      tradeDate    : new Date(),
      instructionDate : new Date()
    };
  };


  //////////////

  // INIT
  ctrl.init();

}

angular.module('nsd.controller.instructions', ['nsd.service.instructions'])
.controller('InstructionsController', InstructionsController);