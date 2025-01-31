import { Injectable } from '@angular/core';
import { StateKeys, Store } from '@store/store';
import { AssetsService } from '@api/services/assets.service';
import { BehaviorSubject, Observable, take } from 'rxjs';
import {
  ResponseAssetsWhiteList,
  WhiteAssetInfo,
} from '@api/models/assets.model';
import { map } from 'rxjs/operators';
import { lthnAssetInfo } from '@parts/data/assets';

@Injectable({
  providedIn: 'root',
})
export class AssetsFacade {
  loading$ = new BehaviorSubject<boolean>(false);

  constructor(private store: Store, private assetsService: AssetsService) {}

  loadWhitelist(): void {
    this.loading$.next(true);
    this.store.set(StateKeys.responseAssetsWhiteList,  {
      "assets": [
        {
          "asset_id": "33f7f5c9233b9f0759cd5966bd96cb014f4a22f01926f9b1c555ed38e307b77f",
          "logo": "https://wallet.lt.hn/logos/usdc_logo.png",
          "price_url": "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd&include_24hr_change=true",
          "ticker": "WUSD",
          "full_name": "Wrapped USD",
          "total_max_supply": 10000000000000000000,
          "current_supply": 1000000000000000000,
          "decimal_point": 10,
          "meta_info": ""
        }
      ],
      "signature": ""
    } );
    this.loading$.next(false);
    // this.assetsService
    //   .assetsWhitelist()
    //   .pipe(take(1))
    //   .subscribe({
    //     next: response => {
    //       this.store.set(StateKeys.responseAssetsWhiteList,  response );
    //       this.loading$.next(false);
    //     },
    //     error: () => {
    //       this.loading$.next(false);
    //     },
    //   });
  }

  getWhitelist(): Observable<WhiteAssetInfo[]> {
    return this.store
      .select<ResponseAssetsWhiteList>(StateKeys.responseAssetsWhiteList)
      .pipe(
        map(({ assets }) => {
          return [lthnAssetInfo, ...assets];
        })
      );
  }

  getAssetByIdFromWhitelist(
    asset_id: string
  ): Observable<WhiteAssetInfo | undefined> {
    return this.getWhitelist().pipe(
      map(arr => arr.find(i => i.asset_id === asset_id))
    );
  }
}
