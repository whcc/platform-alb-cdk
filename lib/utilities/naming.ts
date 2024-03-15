import * as assert from "assert";
import {Naming} from './types'
  

export class NameBuilder implements Naming {
    environment: string;
    region: string;
    constructor( namingConfig : Naming ){
        Object.assign(this,namingConfig,{})
    }

    GetAwsNaming(AwsIndentifer : string):string {
        assert(AwsIndentifer,"Missing AwsIdentifer Parameter for method getAwsNaming");
        return `${AwsIndentifer}-${this.environment}-${this.region}`;
    }
}
