import * as assert from "assert";
import { Config } from './types'
  

export class NameBuilder implements Config {
    environment: string;
    regionCode: string;

    constructor(namingConfig : Config){
        Object.assign(this, namingConfig, {})
    }

    GetAwsNaming(AwsIndentifer : string):string {
        assert(AwsIndentifer,"Missing AwsIdentifer Parameter for method getAwsNaming");
        return `${AwsIndentifer}-${this.environment}-${this.regionCode}`;
    }
}
