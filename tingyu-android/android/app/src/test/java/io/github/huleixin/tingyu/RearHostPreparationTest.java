package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostPreparationTest.java
public class RearHostPreparationTest {
    @Test public void inactiveOwnCardsCanPrepareInDozeWithoutAnActiveOrVisibleRequirement(){
        for(int power:new int[]{2,3,4}){
            assertTrue(RearHostPreparation.allowed(1000,0,true,true,true,true,power));
            assertTrue(RearHostPreparation.allowed(4499,0,true,true,true,true,power));
            assertFalse(RearHostPreparation.allowed(4500,0,true,true,true,true,power));
            assertFalse(RearHostPreparation.allowed(9000,0,true,true,true,true,power));
        }
    }
    @Test public void offLostIdentityDetachPreferenceAndLeaseLossStopPreparation(){
        assertFalse(RearHostPreparation.allowed(1000,0,true,true,true,true,1));
        assertFalse(RearHostPreparation.allowed(1000,0,true,true,true,false,3));
        assertFalse(RearHostPreparation.allowed(1000,0,false,true,true,true,3));
        assertFalse(RearHostPreparation.allowed(1000,0,true,false,true,true,3));
        assertFalse(RearHostPreparation.allowed(1000,0,true,true,false,true,3));
    }
}
