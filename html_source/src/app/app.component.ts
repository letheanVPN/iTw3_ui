import {
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { BackendService } from '@api/services/backend.service';
import { Router } from '@angular/router';
import { VariablesService } from '@parts/services/variables.service';
import { ContextMenuComponent } from '@perfectmemory/ngx-contextmenu';
import { IntToMoneyPipe } from '@parts/pipes';
import { BigNumber } from 'bignumber.js';
import { ModalService } from '@parts/services/modal.service';
import { StateKeys, Store } from '@store/store';
import { Subject, take } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { paths, pathsChildrenAuth } from './pages/paths';
import { hasOwnProperty } from '@parts/functions/hasOwnProperty';
import { AssetsFacade } from '@store/assets/assets.facade';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  intervalUpdatePriceState;

  intervalUpdateContractsState;

  expMedTsEvent;

  onQuitRequest = false;

  firstOnlineState = false;

  translateUsed = false;

  needOpenWallets = [];

  @ViewChild('allContextMenu', { static: true })
  public allContextMenu: ContextMenuComponent<any>;

  @ViewChild('onlyCopyContextMenu', { static: true })
  public onlyCopyContextMenu: ContextMenuComponent<any>;

  @ViewChild('pasteSelectContextMenu', { static: true })
  public pasteSelectContextMenu: ContextMenuComponent<any>;

  private destroy$ = new Subject<void>();

  constructor(
    public variablesService: VariablesService,
    public translate: TranslateService,
    private http: HttpClient,
    private renderer: Renderer2,
    private backend: BackendService,
    private router: Router,
    private ngZone: NgZone,
    private intToMoneyPipe: IntToMoneyPipe,
    private modalService: ModalService,
    private store: Store,
    private assetsFacade: AssetsFacade
  ) {
    translate.addLangs(['en', 'fr', 'de', 'it', 'pt']);
    translate.setDefaultLang('en');
    // const browserLang = translate.getBrowserLang();
    // translate.use(browserLang.match(/en|fr/) ? browserLang : 'en');
    translate.use('en').subscribe({
      next: () => {
        this.translateUsed = true;
      },
    });
  }

  setBackendLocalization(): void {
    if (this.translateUsed) {
      const stringsArray = [
        this.translate.instant('BACKEND_LOCALIZATION.QUIT'),
        this.translate.instant('BACKEND_LOCALIZATION.IS_RECEIVED'),
        this.translate.instant('BACKEND_LOCALIZATION.IS_CONFIRMED'),
        this.translate.instant(
          'BACKEND_LOCALIZATION.INCOME_TRANSFER_UNCONFIRMED'
        ),
        this.translate.instant(
          'BACKEND_LOCALIZATION.INCOME_TRANSFER_CONFIRMED'
        ),
        this.translate.instant('BACKEND_LOCALIZATION.MINED'),
        this.translate.instant('BACKEND_LOCALIZATION.LOCKED'),
        this.translate.instant('BACKEND_LOCALIZATION.IS_MINIMIZE'),
        this.translate.instant('BACKEND_LOCALIZATION.RESTORE'),
        this.translate.instant('BACKEND_LOCALIZATION.TRAY_MENU_SHOW'),
        this.translate.instant('BACKEND_LOCALIZATION.TRAY_MENU_MINIMIZE'),
      ];
      this.backend.setBackendLocalization(
        stringsArray,
        this.variablesService.settings.language
      );
    } else {
      console.warn('wait translate use');
      setTimeout(() => {
        this.setBackendLocalization();
      }, 10000);
    }
  }

  ngOnInit(): void {
    this.variablesService.allContextMenu = this.allContextMenu;
    this.variablesService.onlyCopyContextMenu = this.onlyCopyContextMenu;
    this.variablesService.pasteSelectContextMenu = this.pasteSelectContextMenu;

    this.backend.initService().subscribe({
      next: initMessage => {
        console.log('Init message: ', initMessage);
        this.backend.getOptions();
        this.backend.webkitLaunchedScript();

        this.backend.start_backend(false, '127.0.0.1', 11512, (st2, dd2) => {
          console.log(st2, dd2);
        });

        this.backend.eventSubscribe('quit_requested', () => {
          this.variablesService.event_quit_requested$.next();
          if (!this.onQuitRequest) {
            this.ngZone.run(() => {
              this.router.navigate(['/']);
            });
            this.needOpenWallets = [];
            this.variablesService.daemon_state = 5;
            const saveFunction = (): void => {
              this.backend.storeAppData((): void => {
                const recursionCloseWallets = (): void => {
                  if (this.variablesService.wallets.length > 0) {
                    const lastIndex = this.variablesService.wallets.length - 1;
                    this.backend.closeWallet(
                      this.variablesService.wallets[lastIndex].wallet_id,
                      () => {
                        this.variablesService.wallets.splice(lastIndex, 1);
                        recursionCloseWallets();
                      }
                    );
                  } else {
                    this.backend.quitRequest();
                  }
                };
                recursionCloseWallets();
              });
            };
            if (this.variablesService.appPass) {
              this.backend.storeSecureAppData(() => {
                saveFunction();
              });
            } else {
              saveFunction();
            }
          }
          this.onQuitRequest = true;
        });

        this.backend.eventSubscribe('update_wallet_status', data => {
          console.log(
            '----------------- update_wallet_status -----------------'
          );
          console.log(data);

          const wallet_state = data.wallet_state;
          const is_mining = data.is_mining;
          const wallet = this.variablesService.getWallet(data.wallet_id);
          // 1-synch, 2-ready, 3 - error
          if (wallet) {
            this.ngZone.run(() => {
              wallet.loaded = false;
              wallet.staking = is_mining;
              if (wallet_state === 2) {
                // ready
                wallet.loaded = true;
              }
              if (wallet_state === 3) {
                // error
                // wallet.error = true;
              }
              wallet.balances = data.balances;
              // wallet.unlocked_balance = data.unlocked_balance;
              wallet.mined_total = data.minied_total;
              wallet.alias_available = data.is_alias_operations_available;
            });
          }
        });

        this.backend.eventSubscribe('wallet_sync_progress', data => {
          console.log(
            '----------------- wallet_sync_progress -----------------'
          );
          console.log(data);
          const wallet = this.variablesService.getWallet(data.wallet_id);
          if (wallet) {
            this.ngZone.run(() => {
              wallet.progress =
                data.progress < 0
                  ? 0
                  : data.progress > 100
                  ? 100
                  : data.progress;
              if (!this.variablesService.sync_started) {
                this.variablesService.sync_started = true;
              }
              this.addToStore(wallet, true); // subscribe on data
              if (wallet.progress === 0) {
                wallet.loaded = false;
              } else if (wallet.progress === 100) {
                wallet.loaded = true;
                this.addToStore(wallet, false);
                this.variablesService.sync_started = false;
              }
            });
          }
        });

        this.backend.eventSubscribe('update_daemon_state', data => {
          console.log(
            '----------------- update_daemon_state -----------------'
          );
          console.log('DAEMON:' + data.daemon_network_state);
          console.log(data);
          // this.variablesService.exp_med_ts = data['expiration_median_timestamp'] + 600 + 1;
          this.variablesService.setExpMedTs(
            data['expiration_median_timestamp'] + 600 + 1
          );
          this.variablesService.net_time_delta_median =
            data.net_time_delta_median;
          this.variablesService.last_build_available =
            data.last_build_available;
          this.variablesService.last_build_displaymode =
            data.last_build_displaymode;
          this.variablesService.setHeightApp(data.height);
          this.variablesService.setHeightMax(data.max_net_seen_height);

          this.variablesService.setDownloadedBytes(data.downloaded_bytes);
          this.variablesService.setTotalBytes(data.download_total_data_size);

          this.backend.getContactAlias();
          this.ngZone.run(() => {
            this.variablesService.daemon_state = data['daemon_network_state'];
            if (data['daemon_network_state'] === 1) {
              const max =
                data['max_net_seen_height'] -
                data['synchronization_start_height'];
              const current =
                data.height - data['synchronization_start_height'];
              const return_val =
                Math.floor(((current * 100) / max) * 100) / 100;
              if (max === 0 || return_val < 0) {
                this.variablesService.sync.progress_value = 0;
                this.variablesService.sync.progress_value_text = '0.00';
              } else if (return_val >= 100) {
                this.variablesService.sync.progress_value = 100;
                this.variablesService.sync.progress_value_text = '99.99';
              } else {
                this.variablesService.sync.progress_value = return_val;
                this.variablesService.sync.progress_value_text =
                  return_val.toFixed(2);
              }
            }

            if (data['daemon_network_state'] === 6) {
              const max = data['download_total_data_size'];
              const current = data['downloaded_bytes'];
              const return_val = Math.floor((current / max) * 100);
              if (max === 0 || return_val < 0) {
                this.variablesService.download.progress_value = 0;
                this.variablesService.download.progress_value_text = '0.00';
              } else if (return_val >= 100) {
                this.variablesService.download.progress_value = 100;
                this.variablesService.download.progress_value_text = '99.99';
              } else {
                this.variablesService.download.progress_value = return_val;
                this.variablesService.download.progress_value_text =
                  return_val.toFixed(2);
              }
            }
          });
          if (!this.firstOnlineState && data['daemon_network_state'] === 2) {
            this.getAliases();
            this.backend.getContactAlias();
            this.backend.getDefaultFee((status_fee, data_fee) => {
              this.variablesService.default_fee_big = new BigNumber(data_fee);
              this.variablesService.default_fee =
                this.intToMoneyPipe.transform(data_fee);
            });
            this.firstOnlineState = true;
          }
        });

        this.backend.eventSubscribe('money_transfer', data => {
          console.log('----------------- money_transfer -----------------');
          console.log(data);

          if (!data.ti) {
            return;
          }

          const wallet_id = data.wallet_id;
          const tr_info = data.ti;

          const wallet = this.variablesService.getWallet(wallet_id);
          if (wallet) {
            if (wallet.history.length > 40) {
              wallet.history.splice(40, 1);
            }
            this.ngZone.run(() => {
              wallet.balances = data.balances;

              if (tr_info.tx_type === 6) {
                this.variablesService.setRefreshStacking(wallet_id);
              }

              let tr_exists = wallet.excluded_history.some(
                elem => elem.tx_hash === tr_info.tx_hash
              );
              tr_exists = !tr_exists
                ? wallet.history.some(elem => elem.tx_hash === tr_info.tx_hash)
                : tr_exists;

              if (wallet.currentPage === 1) {
                wallet.prepareHistory([tr_info]);
                if (wallet.restore) {
                  wallet.total_history_item = wallet.history.length;
                  wallet.totalPages = Math.ceil(
                    wallet.total_history_item / this.variablesService.count
                  );
                  wallet.totalPages > this.variablesService.maxPages
                    ? (wallet.pages = new Array(5)
                        .fill(1)
                        .map((value, index) => value + index))
                    : (wallet.pages = new Array(wallet.totalPages)
                        .fill(1)
                        .map((value, index) => value + index));
                }
              }

              if (hasOwnProperty(tr_info, 'contract')) {
                const exp_med_ts = this.variablesService.exp_med_ts;
                const height_app = this.variablesService.height_app;
                const contract = tr_info.contract[0];
                if (tr_exists) {
                  for (let i = 0; i < wallet.contracts.length; i++) {
                    if (
                      wallet.contracts[i].contract_id ===
                        contract.contract_id &&
                      wallet.contracts[i].is_a === contract.is_a
                    ) {
                      wallet.contracts[i].cancel_expiration_time =
                        contract.cancel_expiration_time;
                      wallet.contracts[i].expiration_time =
                        contract.expiration_time;
                      wallet.contracts[i].height = contract.height;
                      wallet.contracts[i].timestamp = contract.timestamp;
                      break;
                    }
                  }
                  // $rootScope.getContractsRecount();
                  return;
                }

                if (
                  contract.state === 1 &&
                  contract.expiration_time < exp_med_ts
                ) {
                  contract.state = 110;
                } else if (
                  contract.state === 5 &&
                  contract.cancel_expiration_time < exp_med_ts
                ) {
                  contract.state = 130;
                } else if (contract.state === 1) {
                  const searchResult2 =
                    this.variablesService.settings.notViewedContracts.find(
                      elem =>
                        elem.state === 110 &&
                        elem.is_a === contract.is_a &&
                        elem.contract_id === contract.contract_id
                    );
                  if (searchResult2) {
                    if (searchResult2.time === contract.expiration_time) {
                      contract.state = 110;
                    } else {
                      for (
                        let j = 0;
                        j <
                        this.variablesService.settings.notViewedContracts
                          .length;
                        j++
                      ) {
                        if (
                          this.variablesService.settings.notViewedContracts[j]
                            .contract_id === contract.contract_id &&
                          this.variablesService.settings.notViewedContracts[j]
                            .is_a === contract.is_a
                        ) {
                          this.variablesService.settings.notViewedContracts.splice(
                            j,
                            1
                          );
                          break;
                        }
                      }
                      for (
                        let j = 0;
                        j <
                        this.variablesService.settings.viewedContracts.length;
                        j++
                      ) {
                        if (
                          this.variablesService.settings.viewedContracts[j]
                            .contract_id === contract.contract_id &&
                          this.variablesService.settings.viewedContracts[j]
                            .is_a === contract.is_a
                        ) {
                          this.variablesService.settings.viewedContracts.splice(
                            j,
                            1
                          );
                          break;
                        }
                      }
                    }
                  }
                } else if (
                  contract.state === 2 &&
                  (contract.height === 0 || height_app - contract.height < 10)
                ) {
                  contract.state = 201;
                } else if (contract.state === 2) {
                  const searchResult3 =
                    this.variablesService.settings.viewedContracts.some(
                      elem =>
                        elem.state === 120 &&
                        elem.is_a === contract.is_a &&
                        elem.contract_id === contract.contract_id
                    );
                  if (searchResult3) {
                    contract.state = 120;
                  }
                } else if (contract.state === 5) {
                  const searchResult4 =
                    this.variablesService.settings.notViewedContracts.find(
                      elem =>
                        elem.state === 130 &&
                        elem.is_a === contract.is_a &&
                        elem.contract_id === contract.contract_id
                    );
                  if (searchResult4) {
                    if (
                      searchResult4.time === contract.cancel_expiration_time
                    ) {
                      contract.state = 130;
                    } else {
                      for (
                        let j = 0;
                        j <
                        this.variablesService.settings.notViewedContracts
                          .length;
                        j++
                      ) {
                        if (
                          this.variablesService.settings.notViewedContracts[j]
                            .contract_id === contract.contract_id &&
                          this.variablesService.settings.notViewedContracts[j]
                            .is_a === contract.is_a
                        ) {
                          this.variablesService.settings.notViewedContracts.splice(
                            j,
                            1
                          );
                          break;
                        }
                      }
                      for (
                        let j = 0;
                        j <
                        this.variablesService.settings.viewedContracts.length;
                        j++
                      ) {
                        if (
                          this.variablesService.settings.viewedContracts[j]
                            .contract_id === contract.contract_id &&
                          this.variablesService.settings.viewedContracts[j]
                            .is_a === contract.is_a
                        ) {
                          this.variablesService.settings.viewedContracts.splice(
                            j,
                            1
                          );
                          break;
                        }
                      }
                    }
                  }
                } else if (
                  contract.state === 6 &&
                  (contract.height === 0 || height_app - contract.height < 10)
                ) {
                  contract.state = 601;
                }

                const searchResult =
                  this.variablesService.settings.viewedContracts.some(
                    elem =>
                      elem.state === contract.state &&
                      elem.is_a === contract.is_a &&
                      elem.contract_id === contract.contract_id
                  );
                contract.is_new = !searchResult;

                let findContract = false;
                for (let i = 0; i < wallet.contracts.length; i++) {
                  if (
                    wallet.contracts[i].contract_id === contract.contract_id &&
                    wallet.contracts[i].is_a === contract.is_a
                  ) {
                    for (const prop in contract) {
                      if (hasOwnProperty(contract, prop)) {
                        wallet.contracts[i][prop] = contract[prop];
                      }
                    }
                    findContract = true;
                    break;
                  }
                }
                if (findContract === false) {
                  wallet.contracts.push(contract);
                }
                wallet.recountNewContracts();
              }
            });
          }
        });

        this.backend.backendObject['handle_deeplink_click'].connect(data => {
          console.log(
            '----------------- handle_deeplink_click -----------------'
          );
          console.log(data);
          this.ngZone.run(() => {
            if (data) {
              this.variablesService.deeplink$.next(data);
            }
          });
        });

        this.backend.eventSubscribe('money_transfer_cancel', data => {
          console.log(
            '----------------- money_transfer_cancel -----------------'
          );
          console.log(data);

          if (!data.ti) {
            return;
          }

          const wallet_id = data.wallet_id;
          const tr_info = data.ti;
          const wallet = this.variablesService.getWallet(wallet_id);

          if (wallet) {
            if (hasOwnProperty(tr_info, 'contract')) {
              for (let i = 0; i < wallet.contracts.length; i++) {
                if (
                  wallet.contracts[i].contract_id ===
                    tr_info.contract[0].contract_id &&
                  wallet.contracts[i].is_a === tr_info.contract[0].is_a
                ) {
                  if (
                    wallet.contracts[i].state === 1 ||
                    wallet.contracts[i].state === 110
                  ) {
                    wallet.contracts[i].is_new = true;
                    wallet.contracts[i].state = 140;
                    wallet.recountNewContracts();
                  }
                  break;
                }
              }
            }

            wallet.removeFromHistory(tr_info.tx_hash);

            let error_tr = '';
            switch (tr_info.tx_type) {
              case 0:
                error_tr =
                  this.translate.instant('ERRORS.TX_TYPE_NORMAL') +
                  '<br>' +
                  tr_info.tx_hash +
                  '<br>' +
                  wallet.name +
                  '<br>' +
                  wallet.address +
                  '<br>' +
                  this.translate.instant('ERRORS.TX_TYPE_NORMAL_TO') +
                  ' ' +
                  this.intToMoneyPipe.transform(tr_info.amount) +
                  ' ' +
                  this.translate.instant('ERRORS.TX_TYPE_NORMAL_END');
                break;
              case 1:
                // this.translate.instant('ERRORS.TX_TYPE_PUSH_OFFER');
                break;
              case 2:
                // this.translate.instant('ERRORS.TX_TYPE_UPDATE_OFFER');
                break;
              case 3:
                // this.translate.instant('ERRORS.TX_TYPE_CANCEL_OFFER');
                break;
              case 4:
                error_tr =
                  this.translate.instant('ERRORS.TX_TYPE_NEW_ALIAS') +
                  '<br>' +
                  tr_info.tx_hash +
                  '<br>' +
                  wallet.name +
                  '<br>' +
                  wallet.address +
                  '<br>' +
                  this.translate.instant('ERRORS.TX_TYPE_NEW_ALIAS_END');
                break;
              case 5:
                error_tr =
                  this.translate.instant('ERRORS.TX_TYPE_UPDATE_ALIAS') +
                  '<br>' +
                  tr_info.tx_hash +
                  '<br>' +
                  wallet.name +
                  '<br>' +
                  wallet.address +
                  '<br>' +
                  this.translate.instant('ERRORS.TX_TYPE_NEW_ALIAS_END');
                break;
              case 6:
                error_tr = this.translate.instant('ERRORS.TX_TYPE_COIN_BASE');
                break;
            }
            if (error_tr) {
              this.modalService.prepareModal('error', error_tr);
            }
          }
        });

        this.backend.eventSubscribe('on_core_event', data => {
          console.log('----------------- on_core_event -----------------');
          console.log(data);

          data = JSON.parse(data);

          if (data.events != null) {
            for (let i = 0, length = data.events.length; i < length; i++) {
              switch (data.events[i].method) {
                case 'CORE_EVENT_BLOCK_ADDED':
                  break;
                case 'CORE_EVENT_ADD_ALIAS':
                  if (
                    this.variablesService.aliasesChecked[
                      data.events[i].details.address
                    ] != null
                  ) {
                    this.variablesService.aliasesChecked[
                      data.events[i].details.address
                    ]['name'] = '@' + data.events[i].details.alias;
                    this.variablesService.aliasesChecked[
                      data.events[i].details.address
                    ]['address'] = data.events[i].details.address;
                    this.variablesService.aliasesChecked[
                      data.events[i].details.address
                    ]['comment'] = data.events[i].details.comment;
                  }
                  if (this.variablesService.enableAliasSearch) {
                    const newAlias = {
                      name: '@' + data.events[i].details.alias,
                      address: data.events[i].details.address,
                      comment: data.events[i].details.comment,
                    };
                    this.variablesService.aliases =
                      this.variablesService.aliases.concat(newAlias);
                    this.variablesService.changeAliases();
                  }
                  break;
                case 'CORE_EVENT_UPDATE_ALIAS':
                  for (const address in this.variablesService.aliasesChecked) {
                    if (
                      hasOwnProperty(
                        this.variablesService.aliasesChecked,
                        address
                      )
                    ) {
                      if (
                        this.variablesService.aliasesChecked[address].name ===
                        '@' + data.events[i].details.alias
                      ) {
                        if (
                          this.variablesService.aliasesChecked[address]
                            .address !== data.events[i].details.details.address
                        ) {
                          delete this.variablesService.aliasesChecked[address][
                            'name'
                          ];
                          delete this.variablesService.aliasesChecked[address][
                            'address'
                          ];
                          delete this.variablesService.aliasesChecked[address][
                            'comment'
                          ];
                        } else {
                          this.variablesService.aliasesChecked[
                            address
                          ].comment = data.events[i].details.details.comment;
                        }
                        break;
                      }
                    }
                  }
                  if (
                    this.variablesService.aliasesChecked[
                      data.events[i].details.details.address
                    ] != null
                  ) {
                    this.variablesService.aliasesChecked[
                      data.events[i].details.details.address
                    ]['name'] = '@' + data.events[i].details.alias;
                    this.variablesService.aliasesChecked[
                      data.events[i].details.details.address
                    ]['address'] = data.events[i].details.details.address;
                    this.variablesService.aliasesChecked[
                      data.events[i].details.details.address
                    ]['comment'] = data.events[i].details.details.comment;
                  }
                  if (this.variablesService.enableAliasSearch) {
                    const CurrentAlias = this.variablesService.aliases.find(
                      element =>
                        element.name === '@' + data.events[i].details.alias
                    );
                    if (CurrentAlias) {
                      CurrentAlias.address =
                        data.events[i].details.details.address;
                      CurrentAlias.comment =
                        data.events[i].details.details.comment;
                    }
                  }
                  this.variablesService.changeAliases();
                  break;
                default:
                  break;
              }
            }
          }
        });

        this.intervalUpdateContractsState = setInterval(() => {
          this.variablesService.wallets.forEach(wallet => {
            wallet.contracts.forEach(contract => {
              if (
                contract.state === 201 &&
                contract.height !== 0 &&
                this.variablesService.height_app - contract.height >= 10
              ) {
                contract.state = 2;
                contract.is_new = true;
                console.warn('need check state in contracts');
              } else if (
                contract.state === 601 &&
                contract.height !== 0 &&
                this.variablesService.height_app - contract.height >= 10
              ) {
                contract.state = 6;
                contract.is_new = true;
              }
            });
          });
        }, 30000);

        this.expMedTsEvent = this.variablesService.getExpMedTsEvent.subscribe({
          next: (newTimestamp: number) => {
            this.variablesService.wallets.forEach(wallet => {
              wallet.contracts.forEach(contract => {
                if (
                  contract.state === 1 &&
                  contract.expiration_time <= newTimestamp
                ) {
                  contract.state = 110;
                  contract.is_new = true;
                  wallet.recountNewContracts();
                } else if (
                  contract.state === 5 &&
                  contract.cancel_expiration_time <= newTimestamp
                ) {
                  contract.state = 130;
                  contract.is_new = true;
                  wallet.recountNewContracts();
                }
              });
            });
          },
        });

        this.backend.getAppData((status, data) => {
          if (data && Object.keys(data).length > 0) {
            for (const key in data) {
              if (
                hasOwnProperty(data, key) &&
                hasOwnProperty(this.variablesService.settings, key)
              ) {
                this.variablesService.settings[key] = data[key];
              }
            }
            if (
              hasOwnProperty(this.variablesService.settings, 'scale') &&
              ['8px', '10px', '12px', '14px'].indexOf(
                this.variablesService.settings.scale
              ) !== -1
            ) {
              this.renderer.setStyle(
                document.documentElement,
                'font-size',
                this.variablesService.settings.scale
              );
            } else {
              this.variablesService.settings.scale = '10px';
              this.renderer.setStyle(
                document.documentElement,
                'font-size',
                this.variablesService.settings.scale
              );
            }
          }
          this.translate.use(this.variablesService.settings.language);
          this.setBackendLocalization();

          this.backend.setLogLevel(this.variablesService.settings.appLog);
          this.backend.setEnableTor(this.variablesService.settings.appUseTor);

          if (
            !this.variablesService.settings.wallets ||
            this.variablesService.settings.wallets.length === 0
          ) {
            return this.router
              .navigate([`${paths.auth}/${pathsChildrenAuth.noWallet}`])
              .then();
          }

          if (this.router.url !== '/login') {
            this.backend.haveSecureAppData(statusPass => {
              if (statusPass) {
                this.ngZone.run(() => {
                  this.router.navigate(['/login'], {
                    queryParams: { type: 'auth' },
                  });
                });
              } else {
                if (Object.keys(data).length !== 0) {
                  this.needOpenWallets = JSON.parse(
                    JSON.stringify(this.variablesService.settings.wallets)
                  );
                  this.ngZone.run(() => {
                    this.variablesService.appLogin = true;
                    this.router.navigate(['/']);
                  });
                } else {
                  this.ngZone.run(() => {
                    this.router.navigate(['/login'], {
                      queryParams: { type: 'reg' },
                    });
                  });
                }
              }
            });
          }
        });

        /** Start listening dispatchAsyncCallResult */
        this.backend.dispatchAsyncCallResult();

        /** Start listening handleCurrentActionState */
        this.backend.handleCurrentActionState();
      },
      error: error => {
        console.log(error);
      },
    });

    this.variablesService.disable_price_fetch$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: disable_price_fetch => {
          if (!disable_price_fetch) {
            this.updateMoneyEquivalent();
            this.intervalUpdatePriceState = setInterval(() => {
              this.updateMoneyEquivalent();
            }, 30000);
          } else {
            if (this.intervalUpdatePriceState) {
              clearInterval(this.intervalUpdatePriceState);
            }
          }
        },
      });

    this.assetsFacade.loadWhitelist();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    if (this.intervalUpdateContractsState) {
      clearInterval(this.intervalUpdateContractsState);
    }
    if (this.intervalUpdatePriceState) {
      clearInterval(this.intervalUpdatePriceState);
    }
    this.expMedTsEvent.unsubscribe();
  }

  updateMoneyEquivalent(): void {
    this.http
      .get('https://api.coingecko.com/api/v3/ping')
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.http
            .get(
              'https://api.coingecko.com/api/v3/simple/price?ids=zano&vs_currencies=usd&include_24hr_change=true'
            )
            .pipe(take(1))
            .subscribe({
              next: data => {
                this.variablesService.moneyEquivalent = data['zano']['usd'];
                this.variablesService.moneyEquivalentPercent =
                  data['zano']['usd_24h_change'];
              },
              error: error => {
                console.warn('api.coingecko.com price error: ', error);
              },
            });
        },
        error: error => {
          console.warn('api.coingecko.com error: ', error);
          setTimeout(() => {
            this.updateMoneyEquivalent();
          }, 30000);
        },
      });
  }

  getAliases(): void {
    this.backend.getAllAliases((status, data, error) => {
      console.warn(error);

      if (error === 'CORE_BUSY') {
        window.setTimeout(() => {
          this.getAliases();
        }, 10000);
      } else if (error === 'OVERFLOW') {
        this.variablesService.aliases = [];
        this.variablesService.enableAliasSearch = false;
        this.variablesService.wallets.forEach(wallet => {
          wallet.alias = this.backend.getWalletAlias(wallet.address);
        });
      } else {
        this.variablesService.enableAliasSearch = true;
        if (data.aliases && data.aliases.length) {
          this.variablesService.aliases = [];
          data.aliases.forEach(alias => {
            const newAlias = {
              name: '@' + alias.alias,
              address: alias.address,
              comment: alias.comment,
            };
            this.variablesService.aliases.push(newAlias);
          });
          this.variablesService.wallets.forEach(wallet => {
            wallet.alias = this.backend.getWalletAlias(wallet.address);
          });
          this.variablesService.aliases = this.variablesService.aliases.sort(
            (a, b) => {
              if (a.name.length > b.name.length) {
                return 1;
              }
              if (a.name.length < b.name.length) {
                return -1;
              }
              if (a.name > b.name) {
                return 1;
              }
              if (a.name < b.name) {
                return -1;
              }
              return 0;
            }
          );
          this.variablesService.changeAliases();
        }
      }
    });
  }

  contextMenuCopy(target): void {
    if (
      target &&
      (target['nodeName'].toUpperCase() === 'TEXTAREA' ||
        target['nodeName'].toUpperCase() === 'INPUT')
    ) {
      const start = target['contextSelectionStart']
        ? 'contextSelectionStart'
        : 'selectionStart';
      const end = target['contextSelectionEnd']
        ? 'contextSelectionEnd'
        : 'selectionEnd';
      const canUseSelection = target[start] || target[start] === '0';
      const SelectedText = canUseSelection
        ? target['value'].substring(target[start], target[end])
        : target['value'];
      this.backend.setClipboard(String(SelectedText));
    }
  }

  contextMenuOnlyCopy(text): void {
    if (text) {
      this.backend.setClipboard(String(text));
    }
  }

  contextMenuPaste(target): void {
    if (
      target &&
      (target['nodeName'].toUpperCase() === 'TEXTAREA' ||
        target['nodeName'].toUpperCase() === 'INPUT')
    ) {
      this.backend.getClipboard((status, clipboard) => {
        clipboard = String(clipboard);
        if (typeof clipboard !== 'string' || clipboard.length) {
          const start = target['contextSelectionStart']
            ? 'contextSelectionStart'
            : 'selectionStart';
          const end = target['contextSelectionEnd']
            ? 'contextSelectionEnd'
            : 'selectionEnd';
          const _pre = target['value'].substring(0, target[start]);
          const _aft = target['value'].substring(
            target[end],
            target['value'].length
          );
          let text = _pre + clipboard + _aft;
          const cursorPosition = (_pre + clipboard).length;
          if (target['maxLength'] && parseInt(target['maxLength'], 10) > 0) {
            text = text.substr(0, parseInt(target['maxLength'], 10));
          }
          target['value'] = text;
          target.setSelectionRange(cursorPosition, cursorPosition);
          target.dispatchEvent(new Event('input'));
          target['focus']();
        }
      });
    }
  }

  contextMenuSelect(target): void {
    if (
      target &&
      (target['nodeName'].toUpperCase() === 'TEXTAREA' ||
        target['nodeName'].toUpperCase() === 'INPUT')
    ) {
      target['focus']();
      setTimeout(() => {
        target['select']();
      });
    }
  }

  addToStore(wallet, boolean): void {
    const value = this.store.state.sync;
    if (value && value.length > 0) {
      const sync = value.filter(item => item.wallet_id === wallet.wallet_id);
      if (sync && sync.length > 0) {
        const result = value.map(item => {
          if (item.wallet_id === wallet.wallet_id) {
            return { sync: boolean, wallet_id: wallet.wallet_id };
          } else {
            return item;
          }
        });
        this.store.set(StateKeys.sync, result);
      } else {
        value.push({ sync: boolean, wallet_id: wallet.wallet_id });
        this.store.set(StateKeys.sync, value);
      }
    } else {
      this.store.set(StateKeys.sync, [
        { sync: boolean, wallet_id: wallet.wallet_id },
      ]);
    }
  }
}
